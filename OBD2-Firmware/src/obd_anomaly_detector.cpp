#include "obd_anomaly_detector.h"

#include "firmware_info.h"

#include <math.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>

#if defined(ARDUINO)
#include <Arduino.h>
#include <LittleFS.h>
#include <Preferences.h>
#include <esp_timer.h>
#endif

namespace
{
constexpr uint16_t kFeatureMaskAll = (1U << ANOMALY_FEATURE_COUNT) - 1U;
constexpr uint8_t kContextSlots = 6; // global + 5 driving contexts
constexpr uint32_t kBaselineMagic = 0x41535A53UL; // ASZS
constexpr uint16_t kBaselineVersion = 1;
constexpr uint32_t kModelFileMagic = 0x4153494DUL; // ASIM
constexpr uint16_t kModelFileVersion = 2;
constexpr const char *kPrefsNamespace = "obd_anom";
constexpr const char *kPrefsBaseline = "baseline";
constexpr const char *kModelPath = "/anomaly_iforest.bin";
constexpr const char *kConfigPartitionLabel = "configfs";

const uint16_t kFeatureBits[ANOMALY_FEATURE_COUNT] = {
    ANOMALY_SAMPLE_RPM,
    ANOMALY_SAMPLE_SPEED,
    ANOMALY_SAMPLE_COOLANT,
    ANOMALY_SAMPLE_THROTTLE,
    ANOMALY_SAMPLE_FUEL_LEVEL,
    ANOMALY_SAMPLE_ENGINE_LOAD,
    ANOMALY_SAMPLE_MAP,
    ANOMALY_SAMPLE_MAF,
    ANOMALY_SAMPLE_ECU_VOLTAGE,
    ANOMALY_SAMPLE_INTAKE_AIR,
    ANOMALY_SAMPLE_SPARK_ADVANCE,
};

const float kStdFloor[ANOMALY_FEATURE_COUNT] = {
    80.0f, 2.0f, 2.0f, 1.0f, 0.8f, 1.0f, 2.0f, 0.2f, 0.10f, 2.0f, 1.0f,
};

const float kZThreshold[ANOMALY_FEATURE_COUNT] = {
    3.8f, 3.8f, 3.5f, 4.0f, 4.5f, 3.8f, 3.8f, 3.8f, 3.0f, 3.8f, 4.0f,
};

struct RunningStats
{
    uint32_t count{0};
    float mean{0.0f};
    float m2{0.0f};
    float minValue{0.0f};
    float maxValue{0.0f};
};

struct PersistedBaseline
{
    uint32_t magic{kBaselineMagic};
    uint16_t version{kBaselineVersion};
    uint16_t featureMask{0};
    uint32_t identityCrc{0};
    uint32_t minSamples{0};
    RunningStats stats[kContextSlots][ANOMALY_FEATURE_COUNT]{};
    uint32_t checksum{0};
};

struct PersistedModelHeader
{
    uint32_t magic{kModelFileMagic};
    uint16_t version{kModelFileVersion};
    uint16_t featureMask{0};
    uint32_t identityCrc{0};
    uint32_t stateSize{0};
    uint32_t checksum{0};
};

uint32_t fnv1a(const void *data, size_t len, uint32_t hash = 2166136261UL)
{
    const uint8_t *bytes = static_cast<const uint8_t *>(data);
    for (size_t i = 0; i < len; i++)
    {
        hash ^= bytes[i];
        hash *= 16777619UL;
    }
    return hash;
}

uint32_t identityCrc(const char *profileId, const char *profileHash)
{
    uint32_t hash = fnv1a(kAutoSenseFirmwareVersion, strlen(kAutoSenseFirmwareVersion));
    if (profileId)
    {
        hash = fnv1a(profileId, strlen(profileId), hash);
    }
    if (profileHash)
    {
        hash = fnv1a(profileHash, strlen(profileHash), hash);
    }
    return hash;
}

uint8_t popcount16(uint16_t value)
{
    uint8_t count = 0;
    while (value)
    {
        count += value & 1U;
        value >>= 1U;
    }
    return count;
}

float clampf(float value, float low, float high)
{
    if (value < low)
    {
        return low;
    }
    if (value > high)
    {
        return high;
    }
    return value;
}

int16_t clampI16(float value, float low, float high)
{
    value = clampf(value, low, high);
    return (int16_t)(value >= 0.0f ? value + 0.5f : value - 0.5f);
}

void statsUpdate(RunningStats &stats, float value)
{
    stats.count++;
    if (stats.count == 1)
    {
        stats.mean = value;
        stats.m2 = 0.0f;
        stats.minValue = value;
        stats.maxValue = value;
        return;
    }
    if (value < stats.minValue)
    {
        stats.minValue = value;
    }
    if (value > stats.maxValue)
    {
        stats.maxValue = value;
    }
    float delta = value - stats.mean;
    stats.mean += delta / (float)stats.count;
    stats.m2 += delta * (value - stats.mean);
}

float statsStdDev(const RunningStats &stats, uint8_t feature)
{
    if (stats.count < 2)
    {
        return kStdFloor[feature];
    }
    float variance = stats.m2 / (float)(stats.count - 1);
    if (variance < 0.0f)
    {
        variance = 0.0f;
    }
    float stdDev = sqrtf(variance);
    return stdDev < kStdFloor[feature] ? kStdFloor[feature] : stdDev;
}

uint8_t contextSlot(AnomalyDrivingContext context)
{
    switch (context)
    {
    case AnomalyDrivingContext::Idle:
        return 2;
    case AnomalyDrivingContext::Cruising:
        return 3;
    case AnomalyDrivingContext::Accelerating:
        return 4;
    case AnomalyDrivingContext::Decelerating:
        return 5;
    default:
        return 1;
    }
}

uint8_t areaForFeature(uint8_t feature)
{
    switch (feature)
    {
    case 0:
        return ANOMALY_AREA_ENGINE | ANOMALY_AREA_DRIVING;
    case 1:
    case 3:
    case 10:
        return ANOMALY_AREA_DRIVING;
    case 2:
        return ANOMALY_AREA_TEMPERATURE | ANOMALY_AREA_ENGINE;
    case 4:
        return ANOMALY_AREA_FUEL | ANOMALY_AREA_SENSOR;
    case 5:
        return ANOMALY_AREA_ENGINE;
    case 6:
    case 7:
    case 9:
        return ANOMALY_AREA_INTAKE | ANOMALY_AREA_SENSOR;
    case 8:
        return ANOMALY_AREA_ELECTRICAL;
    default:
        return ANOMALY_AREA_SENSOR;
    }
}

float featureValue(const ObdSample &sample, uint8_t feature)
{
    switch (feature)
    {
    case 0:
        return (float)sample.rpm;
    case 1:
        return (float)sample.speedKph;
    case 2:
        return (float)sample.coolantC;
    case 3:
        return (float)sample.throttlePct;
    case 4:
        return (float)sample.fuelLevelPct;
    case 5:
        return (float)sample.engineLoadPct;
    case 6:
        return (float)sample.mapKpa;
    case 7:
        return (float)sample.mafCentiGps / 100.0f;
    case 8:
        return (float)sample.ecuMv / 1000.0f;
    case 9:
        return (float)sample.intakeAirC;
    case 10:
        return (float)sample.sparkAdvanceDeg10 / 10.0f;
    default:
        return 0.0f;
    }
}

uint32_t microsNow()
{
#if defined(ARDUINO)
    return (uint32_t)esp_timer_get_time();
#else
    return 0;
#endif
}

void logLine(const ObdAnomalyConfig &config, const AnomalyResult &result)
{
#if defined(ARDUINO)
    if (!config.debugLogs && result.severity < AnomalySeverity::Warning)
    {
        return;
    }
    Serial.printf("[anomaly] severity=%s score=%.1f z=%.1f if=%.1f ctx=%s top=%s:%.1f,%s:%.1f,%s:%.1f area=0x%02X us=%lu\n",
                  obd_anomaly_severity_name(result.severity),
                  result.score,
                  result.zScore,
                  result.iforestScore,
                  obd_anomaly_context_name(result.context),
                  obd_anomaly_feature_name(result.topSignals[0].feature),
                  result.topSignals[0].zScore,
                  obd_anomaly_feature_name(result.topSignals[1].feature),
                  result.topSignals[1].zScore,
                  obd_anomaly_feature_name(result.topSignals[2].feature),
                  result.topSignals[2].zScore,
                  result.areaMask,
                  (unsigned long)result.inferenceUs);
#else
    (void)config;
    (void)result;
#endif
}

class ObdAnomalyDetector
{
public:
    void configure(const ObdAnomalyConfig &config)
    {
        config_ = config;
        if (config_.intervalSeconds == 0)
        {
            config_.intervalSeconds = 10;
        }
        if (config_.minSamples == 0)
        {
            config_.minSamples = 300;
        }
        if (config_.saveIntervalSeconds == 0)
        {
            config_.saveIntervalSeconds = 300;
        }
    }

    void setIdentity(const char *profileId, const char *profileHash)
    {
        uint32_t next = identityCrc(profileId ? profileId : "", profileHash ? profileHash : "");
        if (next != identityCrc_)
        {
            identityCrc_ = next;
            reset();
        }
    }

    AnomalyResult process(const ObdSample &sample)
    {
        uint32_t startUs = microsNow();
        AnomalyResult result{};
        result.validMask = sample.validMask & kFeatureMaskAll;
        result.context = detectContext(sample);

        if (!config_.enabled || result.validMask == 0)
        {
            lastResult_ = result;
            return lastResult_;
        }

        uint16_t oldFeatureMask = baseline_.featureMask;
        baseline_.featureMask |= result.validMask;
        if (oldFeatureMask != 0 && oldFeatureMask != baseline_.featureMask)
        {
            forest_.reset(baseline_.featureMask);
        }

        result.baselineReady = baselineReady(result.validMask, result.context);
        float values[ANOMALY_FEATURE_COUNT]{};
        float zValues[ANOMALY_FEATURE_COUNT]{};
        int16_t normalized[ANOMALY_FEATURE_COUNT]{};
        uint8_t zCount = 0;
        float zSumSq = 0.0f;

        for (uint8_t feature = 0; feature < ANOMALY_FEATURE_COUNT; feature++)
        {
            if (!(result.validMask & kFeatureBits[feature]))
            {
                continue;
            }

            values[feature] = featureValue(sample, feature);
            const RunningStats *stats = selectedStats(result.context, feature);
            if (result.baselineReady && stats && stats->count >= 2)
            {
                float stdDev = statsStdDev(*stats, feature);
                float signedZ = (values[feature] - stats->mean) / stdDev;
                float absZ = fabsf(signedZ);
                zValues[feature] = clampf(absZ, 0.0f, 12.0f);
                normalized[feature] = clampI16(signedZ * 100.0f, -3000.0f, 3000.0f);
                zSumSq += zValues[feature] * zValues[feature];
                zCount++;
                addTop(result, feature, zValues[feature], values[feature]);
                if (zValues[feature] >= kZThreshold[feature])
                {
                    result.areaMask |= areaForFeature(feature);
                }
            }
        }

        if (zCount > 0)
        {
            float rmsZ = sqrtf(zSumSq / (float)zCount);
            result.zScore = clampf(rmsZ * 12.5f, 0.0f, 100.0f);
        }

        if (result.baselineReady && forest_.featureMask() != baseline_.featureMask)
        {
            forest_.reset(baseline_.featureMask);
        }

        result.modelReady = forest_.ready();
        if (result.modelReady)
        {
            float rawIForest = forest_.score(normalized, result.validMask);
            result.iforestScore = clampf((rawIForest - 45.0f) * 4.0f, 0.0f, 100.0f);
        }

        result.score = combinedScore(result);
        AnomalySeverity rawSeverity = severityForScore(result.score);
        result.severity = debounce(rawSeverity);
        result.anomalyWindow = anomalyWindow_;

        if (!result.baselineReady || rawSeverity == AnomalySeverity::Normal)
        {
            updateBaseline(result.context, values, result.validMask);
            dirty_ = true;
        }

        if (result.baselineReady && rawSeverity == AnomalySeverity::Normal && stableForTraining(result.context))
        {
            forest_.addTrainingSample(normalized, result.validMask);
        }

        bool wasModelReady = result.modelReady;
        bool trained = forest_.trainStep();
        result.modelReady = forest_.ready();
        if (trained && !wasModelReady && result.modelReady)
        {
            save();
        }

        if (dirty_ && sample.timestampMs != 0 && lastSaveMs_ != 0 &&
            (sample.timestampMs - lastSaveMs_) >= config_.saveIntervalSeconds * 1000UL)
        {
            save();
        }
        else if (dirty_ && lastSaveMs_ == 0)
        {
            lastSaveMs_ = sample.timestampMs;
        }

        prevSample_ = sample;
        hasPrev_ = true;
        result.inferenceUs = microsNow() - startUs;
        lastResult_ = result;
        logLine(config_, lastResult_);
        return lastResult_;
    }

    bool modelReady() const
    {
        return forest_.ready();
    }

    void reset()
    {
        memset(&baseline_, 0, sizeof(baseline_));
        baseline_.magic = kBaselineMagic;
        baseline_.version = kBaselineVersion;
        baseline_.identityCrc = identityCrc_;
        baseline_.minSamples = config_.minSamples;
        forest_.reset(0);
        hasPrev_ = false;
        anomalyWindow_ = 0;
        lastSeverity_ = AnomalySeverity::Normal;
        dirty_ = true;
    }

    void save()
    {
        baseline_.magic = kBaselineMagic;
        baseline_.version = kBaselineVersion;
        baseline_.identityCrc = identityCrc_;
        baseline_.minSamples = config_.minSamples;
        baseline_.checksum = 0;
        baseline_.checksum = fnv1a(&baseline_, offsetof(PersistedBaseline, checksum));
#if defined(ARDUINO)
        Preferences prefs;
        if (prefs.begin(kPrefsNamespace, false))
        {
            prefs.putBytes(kPrefsBaseline, &baseline_, sizeof(baseline_));
            prefs.end();
        }

        if (forest_.ready() && LittleFS.begin(false, "/littlefs", 4, kConfigPartitionLabel))
        {
            PersistedModelHeader header{};
            const TinyIForestState &state = forest_.state();
            header.featureMask = state.featureMask;
            header.identityCrc = identityCrc_;
            header.stateSize = sizeof(TinyIForestState);
            header.checksum = fnv1a(&state, sizeof(TinyIForestState));
            File file = LittleFS.open(kModelPath, "w");
            if (file)
            {
                file.write((const uint8_t *)&header, sizeof(header));
                file.write((const uint8_t *)&state, sizeof(TinyIForestState));
                file.close();
            }
        }
#endif
        dirty_ = false;
        lastSaveMs_ = prevSample_.timestampMs;
    }

    void load()
    {
#if defined(ARDUINO)
        Preferences prefs;
        PersistedBaseline loaded{};
        if (prefs.begin(kPrefsNamespace, true))
        {
            size_t got = prefs.getBytes(kPrefsBaseline, &loaded, sizeof(loaded));
            prefs.end();
            uint32_t checksum = loaded.checksum;
            loaded.checksum = 0;
            if (got == sizeof(loaded) && checksum == fnv1a(&loaded, offsetof(PersistedBaseline, checksum)) &&
                loaded.magic == kBaselineMagic && loaded.version == kBaselineVersion &&
                loaded.identityCrc == identityCrc_)
            {
                loaded.checksum = checksum;
                baseline_ = loaded;
            }
        }

        if (LittleFS.begin(false, "/littlefs", 4, kConfigPartitionLabel))
        {
            File file = LittleFS.open(kModelPath, "r");
            if (file && file.size() == (sizeof(PersistedModelHeader) + sizeof(TinyIForestState)))
            {
                PersistedModelHeader header{};
                size_t headerRead = file.readBytes((char *)&header, sizeof(header));
                TinyIForestState &state = forest_.stateForLoad();
                size_t stateRead = file.readBytes((char *)&state, sizeof(state));
                if (headerRead == sizeof(header) && stateRead == sizeof(state) &&
                    header.magic == kModelFileMagic && header.version == kModelFileVersion &&
                    header.identityCrc == identityCrc_ && header.stateSize == sizeof(TinyIForestState) &&
                    header.featureMask == state.featureMask &&
                    header.checksum == fnv1a(&state, sizeof(TinyIForestState)) &&
                    forest_.validateState())
                {
                    // State was read directly into the forest to avoid a large stack object.
                    forest_.loadState(state);
                }
                else
                {
                    forest_.reset(baseline_.featureMask);
                }
                file.close();
            }
        }
#endif
        if (baseline_.magic != kBaselineMagic || baseline_.identityCrc != identityCrc_)
        {
            reset();
        }
        else
        {
            dirty_ = false;
        }
    }

    const AnomalyResult &lastResult() const
    {
        return lastResult_;
    }

private:
    AnomalyDrivingContext detectContext(const ObdSample &sample) const
    {
        bool hasSpeed = sample.validMask & ANOMALY_SAMPLE_SPEED;
        bool hasRpm = sample.validMask & ANOMALY_SAMPLE_RPM;
        if (!hasSpeed || !hasRpm)
        {
            return AnomalyDrivingContext::Unknown;
        }
        if (sample.speedKph <= 2 && sample.rpm >= 450 && sample.rpm <= 1200)
        {
            return AnomalyDrivingContext::Idle;
        }
        if (!hasPrev_)
        {
            return sample.speedKph > 10 ? AnomalyDrivingContext::Cruising : AnomalyDrivingContext::Unknown;
        }

        int speedDelta = (int)sample.speedKph - (int)prevSample_.speedKph;
        int rpmDelta = (int)sample.rpm - (int)prevSample_.rpm;
        if (speedDelta >= 3 || rpmDelta >= 250)
        {
            return AnomalyDrivingContext::Accelerating;
        }
        if (speedDelta <= -3)
        {
            return AnomalyDrivingContext::Decelerating;
        }
        if (sample.speedKph > 10)
        {
            return AnomalyDrivingContext::Cruising;
        }
        return AnomalyDrivingContext::Unknown;
    }

    bool baselineReady(uint16_t validMask, AnomalyDrivingContext context) const
    {
        uint8_t ready = 0;
        uint8_t valid = 0;
        uint8_t slot = contextSlot(context);
        for (uint8_t feature = 0; feature < ANOMALY_FEATURE_COUNT; feature++)
        {
            if (!(validMask & kFeatureBits[feature]))
            {
                continue;
            }
            valid++;
            const RunningStats &ctx = baseline_.stats[slot][feature];
            const RunningStats &global = baseline_.stats[0][feature];
            if (ctx.count >= config_.minSamples || global.count >= config_.minSamples)
            {
                ready++;
            }
        }
        uint8_t needed = valid < 3 ? valid : 3;
        return needed > 0 && ready >= needed;
    }

    const RunningStats *selectedStats(AnomalyDrivingContext context, uint8_t feature) const
    {
        const RunningStats &ctx = baseline_.stats[contextSlot(context)][feature];
        if (ctx.count >= config_.minSamples / 3U && ctx.count >= 20)
        {
            return &ctx;
        }
        const RunningStats &global = baseline_.stats[0][feature];
        return global.count >= 2 ? &global : nullptr;
    }

    void updateBaseline(AnomalyDrivingContext context, const float values[ANOMALY_FEATURE_COUNT], uint16_t validMask)
    {
        uint8_t slot = contextSlot(context);
        for (uint8_t feature = 0; feature < ANOMALY_FEATURE_COUNT; feature++)
        {
            if (!(validMask & kFeatureBits[feature]))
            {
                continue;
            }
            statsUpdate(baseline_.stats[0][feature], values[feature]);
            statsUpdate(baseline_.stats[slot][feature], values[feature]);
        }
    }

    void addTop(AnomalyResult &result, uint8_t feature, float zScore, float value)
    {
        for (uint8_t i = 0; i < 3; i++)
        {
            if (zScore <= result.topSignals[i].zScore)
            {
                continue;
            }
            for (int8_t j = 2; j > i; j--)
            {
                result.topSignals[j] = result.topSignals[j - 1];
            }
            result.topSignals[i].feature = feature;
            result.topSignals[i].zScore = zScore;
            result.topSignals[i].value = value;
            return;
        }
    }

    float combinedScore(const AnomalyResult &result) const
    {
        if (!result.baselineReady)
        {
            return 0.0f;
        }
        if (!result.modelReady)
        {
            return result.zScore;
        }
        uint16_t total = (uint16_t)config_.zWeight + (uint16_t)config_.iforestWeight;
        if (total == 0)
        {
            return result.zScore;
        }
        return ((result.zScore * (float)config_.zWeight) + (result.iforestScore * (float)config_.iforestWeight)) /
               (float)total;
    }

    AnomalySeverity severityForScore(float score) const
    {
        if (score >= 85.0f)
        {
            return AnomalySeverity::Critical;
        }
        if (score >= 65.0f)
        {
            return AnomalySeverity::Warning;
        }
        if (score >= 35.0f)
        {
            return AnomalySeverity::Watch;
        }
        return AnomalySeverity::Normal;
    }

    AnomalySeverity debounce(AnomalySeverity raw)
    {
        bool strong = raw >= AnomalySeverity::Warning;
        anomalyWindow_ = ((anomalyWindow_ << 1U) | (strong ? 1U : 0U)) & 0x1FU;
        uint8_t strongCount = popcount16(anomalyWindow_);
        AnomalySeverity out = raw;
        if (strong && strongCount < 3)
        {
            out = AnomalySeverity::Watch;
        }
        if (raw == AnomalySeverity::Normal && lastSeverity_ > AnomalySeverity::Normal)
        {
            out = (AnomalySeverity)((uint8_t)lastSeverity_ - 1U);
        }
        lastSeverity_ = out;
        return out;
    }

    bool stableForTraining(AnomalyDrivingContext context) const
    {
        return context == AnomalyDrivingContext::Idle || context == AnomalyDrivingContext::Cruising;
    }

    ObdAnomalyConfig config_{};
    PersistedBaseline baseline_{};
    TinyIsolationForest forest_{};
    ObdSample prevSample_{};
    bool hasPrev_{false};
    bool dirty_{false};
    uint32_t identityCrc_{0};
    uint32_t lastSaveMs_{0};
    uint8_t anomalyWindow_{0};
    AnomalySeverity lastSeverity_{AnomalySeverity::Normal};
    AnomalyResult lastResult_{};
};

ObdAnomalyDetector DETECTOR;
} // namespace

void obd_anomaly_configure(const ObdAnomalyConfig &config)
{
    DETECTOR.configure(config);
}

void obd_anomaly_set_identity(const char *profileId, const char *profileHash)
{
    DETECTOR.setIdentity(profileId, profileHash);
}

AnomalyResult obd_anomaly_process_sample(const ObdSample &sample)
{
    return DETECTOR.process(sample);
}

bool obd_anomaly_is_model_ready()
{
    return DETECTOR.modelReady();
}

void obd_anomaly_reset_baseline()
{
    DETECTOR.reset();
}

void obd_anomaly_save_state()
{
    DETECTOR.save();
}

void obd_anomaly_load_state()
{
    DETECTOR.load();
}

const AnomalyResult &obd_anomaly_last_result()
{
    return DETECTOR.lastResult();
}

const char *obd_anomaly_severity_name(AnomalySeverity severity)
{
    switch (severity)
    {
    case AnomalySeverity::Watch:
        return "WATCH";
    case AnomalySeverity::Warning:
        return "WARNING";
    case AnomalySeverity::Critical:
        return "CRITICAL";
    default:
        return "NORMAL";
    }
}

const char *obd_anomaly_context_name(AnomalyDrivingContext context)
{
    switch (context)
    {
    case AnomalyDrivingContext::Idle:
        return "IDLE";
    case AnomalyDrivingContext::Cruising:
        return "CRUISING";
    case AnomalyDrivingContext::Accelerating:
        return "ACCELERATING";
    case AnomalyDrivingContext::Decelerating:
        return "DECELERATING";
    default:
        return "UNKNOWN";
    }
}

const char *obd_anomaly_feature_name(uint8_t feature)
{
    switch (feature)
    {
    case 0:
        return "rpm";
    case 1:
        return "speed";
    case 2:
        return "coolant";
    case 3:
        return "throttle";
    case 4:
        return "fuel";
    case 5:
        return "load";
    case 6:
        return "map";
    case 7:
        return "maf";
    case 8:
        return "battery";
    case 9:
        return "iat";
    case 10:
        return "spark";
    default:
        return "unknown";
    }
}
