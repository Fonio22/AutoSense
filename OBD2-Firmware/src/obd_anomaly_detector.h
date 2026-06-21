#pragma once

#include <stdint.h>

#include "tiny_isolation_forest.h"

enum ObdAnomalySampleBit : uint16_t
{
    ANOMALY_SAMPLE_RPM = 1U << 0,
    ANOMALY_SAMPLE_SPEED = 1U << 1,
    ANOMALY_SAMPLE_COOLANT = 1U << 2,
    ANOMALY_SAMPLE_THROTTLE = 1U << 3,
    ANOMALY_SAMPLE_FUEL_LEVEL = 1U << 4,
    ANOMALY_SAMPLE_ENGINE_LOAD = 1U << 5,
    ANOMALY_SAMPLE_MAP = 1U << 6,
    ANOMALY_SAMPLE_MAF = 1U << 7,
    ANOMALY_SAMPLE_ECU_VOLTAGE = 1U << 8,
    ANOMALY_SAMPLE_INTAKE_AIR = 1U << 9,
    ANOMALY_SAMPLE_SPARK_ADVANCE = 1U << 10,
};

enum class AnomalySeverity : uint8_t
{
    Normal = 0,
    Watch = 1,
    Warning = 2,
    Critical = 3,
};

enum class AnomalyDrivingContext : uint8_t
{
    Unknown = 0,
    Idle = 1,
    Cruising = 2,
    Accelerating = 3,
    Decelerating = 4,
};

enum ObdAnomalyArea : uint8_t
{
    ANOMALY_AREA_NONE = 0,
    ANOMALY_AREA_ENGINE = 1U << 0,
    ANOMALY_AREA_INTAKE = 1U << 1,
    ANOMALY_AREA_FUEL = 1U << 2,
    ANOMALY_AREA_ELECTRICAL = 1U << 3,
    ANOMALY_AREA_TEMPERATURE = 1U << 4,
    ANOMALY_AREA_DRIVING = 1U << 5,
    ANOMALY_AREA_SENSOR = 1U << 6,
};

struct ObdSample
{
    uint32_t timestampMs{0};
    uint16_t validMask{0};
    uint16_t rpm{0};
    uint8_t speedKph{0};
    int16_t coolantC{0};
    uint8_t throttlePct{0};
    uint8_t fuelLevelPct{0};
    uint8_t engineLoadPct{0};
    uint8_t mapKpa{0};
    uint16_t mafCentiGps{0};
    uint16_t ecuMv{0};
    int16_t intakeAirC{0};
    int16_t sparkAdvanceDeg10{0};
};

struct ObdAnomalyConfig
{
    bool enabled{true};
    uint32_t intervalSeconds{10};
    uint32_t minSamples{300};
    uint32_t saveIntervalSeconds{300};
    uint8_t zWeight{70};
    uint8_t iforestWeight{30};
    bool debugLogs{false};
};

struct AnomalySignalContribution
{
    uint8_t feature{0};
    float zScore{0.0f};
    float value{0.0f};
};

struct AnomalyResult
{
    float score{0.0f};
    float zScore{0.0f};
    float iforestScore{0.0f};
    AnomalySeverity severity{AnomalySeverity::Normal};
    AnomalyDrivingContext context{AnomalyDrivingContext::Unknown};
    uint16_t validMask{0};
    uint8_t areaMask{ANOMALY_AREA_NONE};
    AnomalySignalContribution topSignals[3]{};
    bool baselineReady{false};
    bool modelReady{false};
    uint32_t inferenceUs{0};
    uint8_t anomalyWindow{0};
};

void obd_anomaly_configure(const ObdAnomalyConfig &config);
void obd_anomaly_set_identity(const char *profileId, const char *profileHash);
AnomalyResult obd_anomaly_process_sample(const ObdSample &sample);
bool obd_anomaly_is_model_ready();
void obd_anomaly_reset_baseline();
void obd_anomaly_save_state();
void obd_anomaly_load_state();
const AnomalyResult &obd_anomaly_last_result();
const char *obd_anomaly_severity_name(AnomalySeverity severity);
const char *obd_anomaly_context_name(AnomalyDrivingContext context);
const char *obd_anomaly_feature_name(uint8_t feature);
