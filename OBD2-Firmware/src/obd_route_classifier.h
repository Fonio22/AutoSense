#pragma once

#include <stdint.h>

enum ObdRouteInputBit : uint16_t
{
    ROUTE_INPUT_SPEED = 1U << 0,
    ROUTE_INPUT_RPM = 1U << 1,
    ROUTE_INPUT_ENGINE_LOAD = 1U << 2,
    ROUTE_INPUT_THROTTLE = 1U << 3,
};

enum class ObdRouteType : uint8_t
{
    Unknown = 0,
    City = 1,
    Highway = 2,
};

enum class ObdRouteState : uint8_t
{
    Unknown = 0,
    City = 1,
    HighwayCandidate = 2,
    Highway = 3,
};

struct ObdRouteInput
{
    uint16_t validMask{0};
    uint8_t speedKph{0};
    uint16_t rpm{0};
    uint8_t engineLoadPct{0};
    uint8_t throttlePct{0};
};

struct ObdRouteEstimate
{
    ObdRouteType type{ObdRouteType::Unknown};
    ObdRouteState state{ObdRouteState::Unknown};
    uint8_t confidencePct{0};
    int8_t score{0};
    char reason[24]{"insufficient_data"};
};

class ObdRouteClassifier
{
public:
    static constexpr uint32_t kSampleIntervalMs = 10000UL;

    void reset();
    ObdRouteEstimate update(uint32_t nowMs, const ObdRouteInput &input);
    const ObdRouteEstimate &lastEstimate() const;

private:
    static constexpr uint8_t kWindowSize = 24;
    static constexpr uint8_t kMinWindowSamples = 24;
    static constexpr uint8_t kConfirmSamples = 12;
    static constexpr uint32_t kResetGapMs = 30000UL;

    struct WindowStats
    {
        float avgSpeed{0.0f};
        float highSpeedPct{0.0f};
        float stopPct{0.0f};
        float brakePct{0.0f};
        float fastAccelPct{0.0f};
        float avgAbsAccel{0.0f};
    };

    void pushSample(uint8_t speedKph, float accelKphPer10s);
    WindowStats stats() const;
    void setEstimate(ObdRouteState state, const char *reason);
    static ObdRouteType typeForState(ObdRouteState state);
    static int8_t clampScore(int16_t score);

    uint8_t speed_[kWindowSize]{};
    float accel_[kWindowSize]{};
    uint8_t count_{0};
    uint8_t next_{0};
    uint8_t lastSpeed_{0};
    bool haveLastSpeed_{false};
    uint32_t lastAcceptedMs_{0};
    uint8_t candidateTicks_{0};
    uint8_t cityEvidenceTicks_{0};
    float candidateDistanceKm_{0.0f};
    int8_t score_{-10};
    ObdRouteState state_{ObdRouteState::Unknown};
    ObdRouteEstimate estimate_{};
};

const char *obd_route_type_name(ObdRouteType type);
const char *obd_route_state_name(ObdRouteState state);
