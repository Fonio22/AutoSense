#include "app.h"

#include <Arduino.h>
#include <esp32_can.h>
#include <string.h>

#include "app_config.h"
#include "obd_anomaly_detector.h"
#include "obd_ble_protocol.h"
#include "obd_binary_logger.h"
#include "obd_dashboard.h"
#include "obd_read_only_guard.h"
#include "obd_route_classifier.h"
#include "obd_service.h"
#include "uds_vag_scanner.h"
#include "vehicle_profile.h"

namespace
{
constexpr int LED_OK = 4;
constexpr int LED_ERR = 1;

constexpr gpio_num_t CAN_RX_PIN = GPIO_NUM_12;
constexpr gpio_num_t CAN_TX_PIN = GPIO_NUM_13;
constexpr gpio_num_t CAN_LBK_PIN = GPIO_NUM_14;

constexpr uint32_t APP_CAN_DEFAULT_BAUD = 500000;
constexpr bool ENABLE_ACTIVE_QUERY_FALLBACK = true;

struct CanConfig
{
    gpio_num_t rx;
    gpio_num_t tx;
    uint32_t baud;
};

ObdService OBD;
ObdDashboard DASH;
ObdBinaryLogger LOGGER;
ObdRouteClassifier ROUTE_CLASSIFIER;
UdsVagScanner VAG;
AppRuntimeConfig RUNTIME_CONFIG;
ProfileManager PROFILES;
ObdBleProtocol BLE_PROTO;

bool can_ok = false;
bool config_loaded = false;
bool profile_loaded = false;

CanConfig active_can = {CAN_RX_PIN, CAN_TX_PIN, APP_CAN_DEFAULT_BAUD};

uint32_t heartbeat_ms = 0;
uint32_t can_window = 0;

uint32_t stats_can_fps = 0;
uint32_t stats_rsp_fps = 0;
uint32_t stats_dec_fps = 0;
uint32_t stats_key_qps = 0;
uint32_t stats_bg_qps = 0;
uint32_t anomaly_last_ms = 0;
char anomaly_profile_id[40]{0};
char anomaly_profile_hash[ProfileManager::kSha256HexLen + 1]{0};

void pulseLed(int pin, int ms)
{
    digitalWrite(pin, HIGH);
    delay(ms);
    digitalWrite(pin, LOW);
}

int statusLedPin(bool canReady, AnomalySeverity severity)
{
    return (canReady && severity < AnomalySeverity::Warning) ? LED_OK : LED_ERR;
}

bool startCan(const CanConfig &cfg, uint32_t *startedBaud = nullptr)
{
    // NOTE: CAN0.begin()/mode setters already perform disable+enable internally.
    // Calling disable() here adds extra churn and can destabilize TWAI tasks/queues.
    CAN0.setCANPins(cfg.rx, cfg.tx);

    uint32_t setBaud = CAN0.begin(cfg.baud);
    if (setBaud == cfg.baud)
    {
        // Allow active querying even on sparse/no-ACK benches.
        CAN0.setNoACKMode(true);
    }
    CAN0.watchFor();

    if (startedBaud)
    {
        *startedBaud = setBaud;
    }

    can_ok = (setBaud == cfg.baud);
    if (can_ok)
    {
        active_can = cfg;
    }
    return can_ok;
}

void initCan()
{
    // Keep TWAI churn minimal: single init in normal mode.
    bool ok = startCan({CAN_RX_PIN, CAN_TX_PIN, APP_CAN_DEFAULT_BAUD});
    OBD.setActiveQuery(ok && ENABLE_ACTIVE_QUERY_FALLBACK);
}

void processCanFrames(uint32_t nowMs)
{
    CAN_FRAME frame;
    while (CAN0.read(frame))
    {
        OBD.handleFrame(frame, nowMs);
        VAG.handleFrame(frame, nowMs);
        can_window++;
    }
}

void refreshSecondStats(uint32_t nowMs)
{
    if (heartbeat_ms == 0)
    {
        heartbeat_ms = nowMs;
        return;
    }

    if (nowMs - heartbeat_ms < 1000)
    {
        return;
    }

    stats_can_fps = can_window;
    stats_rsp_fps = OBD.responsesWindow();
    stats_dec_fps = OBD.decodedWindow();
    stats_key_qps = OBD.keyQueryPerSec();
    stats_bg_qps = OBD.bgQueryPerSec();

    can_window = 0;
    OBD.clearWindowCounters();
    heartbeat_ms = nowMs;
    pulseLed(statusLedPin(can_ok, obd_anomaly_last_result().severity), 40);
}

void configureAnomaly()
{
    ObdAnomalyConfig config{};
    config.enabled = RUNTIME_CONFIG.anomalyEnabled;
    config.intervalSeconds = RUNTIME_CONFIG.anomalyIntervalSeconds;
    config.minSamples = RUNTIME_CONFIG.anomalyMinSamples;
    config.saveIntervalSeconds = RUNTIME_CONFIG.anomalySaveIntervalSeconds;
    config.zWeight = RUNTIME_CONFIG.anomalyZWeight;
    config.iforestWeight = RUNTIME_CONFIG.anomalyIForestWeight;
    config.debugLogs = RUNTIME_CONFIG.anomalyDebugLogs;
    obd_anomaly_configure(config);
}

void refreshAnomalyIdentity()
{
    const char *profileId = PROFILES.hasActiveProfile() ? PROFILES.activeProfileId() : "none";
    const char *profileHash = PROFILES.hasActiveProfile() ? PROFILES.activeProfileHash() : "";
    if (strcmp(anomaly_profile_id, profileId) == 0 && strcmp(anomaly_profile_hash, profileHash) == 0)
    {
        return;
    }

    snprintf(anomaly_profile_id, sizeof(anomaly_profile_id), "%s", profileId);
    snprintf(anomaly_profile_hash, sizeof(anomaly_profile_hash), "%s", profileHash);
    obd_anomaly_set_identity(anomaly_profile_id, anomaly_profile_hash);
    obd_anomaly_load_state();
}

ObdSample makeAnomalySample(uint32_t nowMs, const ObdCompactSample &compact)
{
    ObdSample sample{};
    sample.timestampMs = nowMs;
    sample.validMask = compact.validMask;
    sample.rpm = compact.rpm;
    sample.speedKph = compact.speedKph;
    sample.coolantC = compact.coolantC;
    sample.throttlePct = compact.throttlePct;
    sample.fuelLevelPct = compact.fuelLevelPct;
    sample.engineLoadPct = compact.engineLoadPct;
    sample.mapKpa = compact.mapKpa;
    sample.mafCentiGps = compact.mafCentiGps;
    sample.ecuMv = compact.ecuMv;
    sample.intakeAirC = compact.intakeAirC;
    sample.sparkAdvanceDeg10 = compact.sparkAdvanceDeg10;
    return sample;
}

ObdRouteInput makeRouteInput(const ObdCompactSample &compact)
{
    ObdRouteInput input{};
    if (compact.validMask & OBD_SAMPLE_SPEED)
    {
        input.validMask |= ROUTE_INPUT_SPEED;
        input.speedKph = compact.speedKph;
    }
    if (compact.validMask & OBD_SAMPLE_RPM)
    {
        input.validMask |= ROUTE_INPUT_RPM;
        input.rpm = compact.rpm;
    }
    if (compact.validMask & OBD_SAMPLE_ENGINE_LOAD)
    {
        input.validMask |= ROUTE_INPUT_ENGINE_LOAD;
        input.engineLoadPct = compact.engineLoadPct;
    }
    if (compact.validMask & OBD_SAMPLE_THROTTLE)
    {
        input.validMask |= ROUTE_INPUT_THROTTLE;
        input.throttlePct = compact.throttlePct;
    }
    return input;
}

void processAnomaly(uint32_t nowMs, const ObdCompactSample &compact)
{
    if (!RUNTIME_CONFIG.anomalyEnabled || compact.validMask == 0)
    {
        return;
    }
    if (anomaly_last_ms != 0 && (nowMs - anomaly_last_ms) < RUNTIME_CONFIG.anomalyIntervalSeconds * 1000UL)
    {
        return;
    }
    anomaly_last_ms = nowMs;
    refreshAnomalyIdentity();
    obd_anomaly_process_sample(makeAnomalySample(nowMs, compact));
}
} // namespace

void appSetup()
{
    Serial.begin(115200);
    delay(120);

    pinMode(LED_OK, OUTPUT);
    pinMode(LED_ERR, OUTPUT);
    digitalWrite(LED_OK, LOW);
    digitalWrite(LED_ERR, LOW);

    // SN65HVD233 loopback pin forced LOW for normal transceiver mode.
    pinMode(CAN_LBK_PIN, OUTPUT);
    digitalWrite(CAN_LBK_PIN, LOW);

    OBD.begin();
    VAG.begin();
    config_loaded = loadAppRuntimeConfig(RUNTIME_CONFIG);
    profile_loaded = PROFILES.begin();
    if (PROFILES.hasActiveProfile())
    {
        OBD.applyRuntimeProfile(PROFILES.activeProfile());
    }
    OBD.setDiagnosticInfoEnabled(RUNTIME_CONFIG.obdDiagnosticInfoEnabled);
    ObdReadOnlyGuard::printPolicy(Serial);
    DASH.setIntervalMs(RUNTIME_CONFIG.dashboardIntervalMs);
    DASH.begin();
    LOGGER.configure(RUNTIME_CONFIG.loggingEnabled, RUNTIME_CONFIG.loggingIntervalSeconds);
    bool logReady = LOGGER.begin();
    configureAnomaly();
    refreshAnomalyIdentity();

    BLE_PROTO.begin(&PROFILES, &OBD, &LOGGER);

    Serial.printf("[boot] config=%s profile=%s:%s profile_fs=%s log=%s log_capacity=%lu interval=%lus anomaly=%s/%lus save=%lus min=%lu dashboard=%s/%lums ebook=%s obd_diag=%s vag_ext=%s transport=USB-CDC+BLE\n",
                  config_loaded ? "ini" : "defaults",
                  PROFILES.hasActiveProfile() ? PROFILES.activeProfileId() : "none",
                  PROFILES.hasActiveProfile() ? PROFILES.activeProfileVersion() : "",
                  profile_loaded ? "ready" : "empty",
                  logReady ? "ready" : "down",
                  (unsigned long)LOGGER.stats().capacityRecords,
                  (unsigned long)LOGGER.stats().intervalSeconds,
                  RUNTIME_CONFIG.anomalyEnabled ? "on" : "off",
                  (unsigned long)RUNTIME_CONFIG.anomalyIntervalSeconds,
                  (unsigned long)RUNTIME_CONFIG.anomalySaveIntervalSeconds,
                  (unsigned long)RUNTIME_CONFIG.anomalyMinSamples,
                  RUNTIME_CONFIG.dashboardEnabled ? "on" : "off",
                  (unsigned long)RUNTIME_CONFIG.dashboardIntervalMs,
                  RUNTIME_CONFIG.dashboardEbookMode ? "on" : "off",
                  RUNTIME_CONFIG.obdDiagnosticInfoEnabled ? "on" : "off",
                  RUNTIME_CONFIG.vagExtendedEnabled ? "on" : "off");

    initCan();
    pulseLed(statusLedPin(can_ok, obd_anomaly_last_result().severity), 180);
}

void appLoop()
{
    uint32_t nowMs = millis();

    OBD.tick(nowMs, can_ok);
    BLE_PROTO.tick(nowMs);
    const ObdVehicleInfo &vehicleInfo = OBD.vehicleInfo();
    const bool extendedReadOnlyAllowed = PROFILES.extendedReadOnlyEnabled();
    VAG.tick(nowMs, can_ok, RUNTIME_CONFIG.vagExtendedEnabled && extendedReadOnlyAllowed);
    processCanFrames(nowMs);
    refreshSecondStats(nowMs);

    ObdCompactSample compactSample{};
    OBD.collectCompactSample(nowMs, RUNTIME_CONFIG.loggingMaxSampleAgeSeconds * 1000UL, &compactSample);
    BLE_PROTO.setRouteEstimate(ROUTE_CLASSIFIER.update(nowMs, makeRouteInput(compactSample)));
    LOGGER.tick(nowMs, compactSample);
    processAnomaly(nowMs, compactSample);

    ObdDashboardState dashState{};
    dashState.canOk = can_ok;
    dashState.queryMode = OBD.activeQuery();
    dashState.queryPidCount = OBD.queryPidCount();
    dashState.keyPidCount = OBD.keyPidCount();
    dashState.bgPidCount = OBD.bgPidCount();
    dashState.supportedPidCount = OBD.supportedPidCount();
    dashState.canFps = stats_can_fps;
    dashState.obdRspPerSec = stats_rsp_fps;
    dashState.obdDecPerSec = stats_dec_fps;
    dashState.keyQueryPerSec = stats_key_qps;
    dashState.bgQueryPerSec = stats_bg_qps;
    dashState.readGuardBlocked = OBD.readGuardBlocked();
    dashState.vagEnabled = VAG.enabled();
    dashState.vagActive = VAG.active();
    dashState.vagGuardBlocked = VAG.blockedCount();
    dashState.uptimeMs = nowMs;
    const ObdLogStats &logStats = LOGGER.stats();
    dashState.logReady = logStats.ready;
    dashState.logEnabled = logStats.enabled;
    dashState.logSequence = logStats.lastSequence;
    dashState.logRecords = logStats.recordsWritten;
    dashState.logCapacity = logStats.capacityRecords;
    dashState.logErrors = logStats.writeErrors + logStats.eraseErrors;
    dashState.logIntervalSeconds = logStats.intervalSeconds;
    dashState.ebookMode = RUNTIME_CONFIG.dashboardEbookMode;
    snprintf(dashState.route, sizeof(dashState.route), "%s", OBD.mode01RouteName());
    snprintf(dashState.transport, sizeof(dashState.transport), "%s", "USB-CDC+BLE");

    if (RUNTIME_CONFIG.dashboardEnabled)
    {
        DASH.tick(nowMs, dashState, OBD, vehicleInfo, VAG);
    }

    delay(1);
}
