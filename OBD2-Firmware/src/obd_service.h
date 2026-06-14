#pragma once

#include <Arduino.h>
#include <esp32_can.h>

struct ObdMetric
{
    uint8_t pid{0};
    bool supported{false};
    bool decoded{false};
    bool warn{false};
    bool error{false};
    uint32_t lastUpdateMs{0};
    uint32_t lastChangeMs{0};
    char key[20]{0};
    char value[24]{0};
    char unit[12]{0};
};

struct ObdVehicleInfo
{
    char vin[24]{0};
    char calid[40]{0};
    char cvn[24]{0};
    uint8_t dtcCount{0};
    char dtcs[8][6]{{0}};
    uint32_t lastVinMs{0};
    uint32_t lastCalIdMs{0};
    uint32_t lastCvnMs{0};
    uint32_t lastDtcMs{0};
};

enum ObdCompactField : uint16_t
{
    OBD_SAMPLE_RPM = 1U << 0,
    OBD_SAMPLE_SPEED = 1U << 1,
    OBD_SAMPLE_COOLANT = 1U << 2,
    OBD_SAMPLE_THROTTLE = 1U << 3,
    OBD_SAMPLE_FUEL_LEVEL = 1U << 4,
    OBD_SAMPLE_ENGINE_LOAD = 1U << 5,
    OBD_SAMPLE_MAP = 1U << 6,
    OBD_SAMPLE_MAF = 1U << 7,
    OBD_SAMPLE_ECU_VOLTAGE = 1U << 8,
};

struct ObdCompactSample
{
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
};

class ObdService
{
public:
    void begin();
    void setActiveQuery(bool enabled);
    bool activeQuery() const;

    void tick(uint32_t nowMs, bool canReady);
    bool handleFrame(const CAN_FRAME &frame, uint32_t nowMs);

    uint32_t responsesWindow() const;
    uint32_t decodedWindow() const;
    uint16_t queryPidCount() const;
    uint16_t keyPidCount() const;
    uint16_t bgPidCount() const;
    uint16_t supportedPidCount() const;
    const char *mode01RouteName() const;
    uint32_t keyQueryPerSec() const;
    uint32_t bgQueryPerSec() const;

    uint16_t collectMetrics(ObdMetric *out, uint16_t maxOut) const;
    bool collectCompactSample(uint32_t nowMs, uint32_t maxAgeMs, ObdCompactSample *out) const;
    const ObdVehicleInfo &vehicleInfo() const;

    void clearWindowCounters();

private:
    static constexpr uint8_t kMaxPid = 0xC0;
    static constexpr uint8_t kMaxQueryPids = 192;
    static constexpr uint8_t kMaxKeyPids = 16;

    enum class Mode01Route : uint8_t
    {
        StdFunctional7DF = 0,
        StdPhysical7E0 = 1,
        ExtFunctional29b = 2,
    };

    struct ObdSchedulerState
    {
        uint32_t lastKeyMs{0};
        uint32_t lastBgMs{0};
        uint32_t lastMode03Ms{0};
        uint32_t lastMode09Ms{0};
    };

    struct ObdPidHealth
    {
        uint32_t lastReqMs{0};
        uint32_t lastRspMs{0};
        uint16_t missCount{0};
        bool active{false};
    };

    void sendMode01Request(uint8_t pid, uint32_t nowMs);
    void sendMode03Request();
    void sendMode09Request(uint8_t pid);
    void sendRequestFrame(uint32_t id, bool extended, uint8_t lenByte, uint8_t service, uint8_t pid);

    bool decodeMode01Pid(uint8_t pid, const uint8_t *data, uint8_t dataLen, uint32_t nowMs);
    bool parseMode03(const CAN_FRAME &frame, uint32_t nowMs);
    bool parseMode09(const CAN_FRAME &frame, uint32_t nowMs);

    static bool isObdResponseFrame(const CAN_FRAME &frame);
    static bool isMode01Response(const CAN_FRAME &frame);
    static bool isMode03Response(const CAN_FRAME &frame);
    static bool isMode09Response(const CAN_FRAME &frame);
    static bool isSupportBitmapPid(uint8_t pid);

    void resetDiscovery();
    void rebuildQueryPlan();
    bool addKeyPid(uint8_t pid);
    bool addBgPid(uint8_t pid);
    void handleSupportedBitmap(uint8_t pid, const uint8_t *data, uint8_t dataLen);
    bool isKeyPid(uint8_t pid) const;
    bool scheduleKeyLane(uint32_t nowMs);
    bool scheduleBgLane(uint32_t nowMs);
    bool shouldSkipBgPid(uint8_t pid, uint32_t nowMs) const;
    void markMode01Request(uint8_t pid, uint32_t nowMs);
    void markMode01Response(uint8_t pid, uint32_t nowMs);
    void switchMode01Route(Mode01Route route, uint32_t nowMs);
    void manageMode01Route(uint32_t nowMs);
    static const char *routeName(Mode01Route route);

    void setMetricText(uint8_t pid,
                       const char *key,
                       const char *value,
                       const char *unit,
                       bool decoded,
                       bool warn,
                       bool error,
                       uint32_t nowMs);
    void setRawMetric(uint8_t pid, const uint8_t *data, uint8_t dataLen, uint32_t nowMs);
    void markCompactField(uint8_t fieldIndex, uint32_t nowMs);

    void parseMode09Support(const uint8_t *data, uint8_t dataLen);
    void updateMode09Ascii(char *target,
                           size_t targetSize,
                           uint8_t *chunkLens,
                           uint8_t frameIdx,
                           const uint8_t *payload,
                           uint8_t payloadLen,
                           uint32_t nowMs,
                           uint32_t *lastUpdateMs);
    void updateMode09Hex(char *target,
                         size_t targetSize,
                         uint8_t *chunkLens,
                         uint8_t frameIdx,
                         const uint8_t *payload,
                         uint8_t payloadLen,
                         uint32_t nowMs,
                         uint32_t *lastUpdateMs);

    bool activeQuery_{false};
    bool discoveryComplete_{false};

    bool supportAnswered_[7] = {false, false, false, false, false, false, false};
    bool supported_[256] = {false};
    bool rawSeen_[256] = {false};

    bool mode09Supported_[256] = {false};
    bool mode09SupportKnown_{false};

    uint8_t supportCursor_{0};
    uint8_t keyQueryPids_[kMaxKeyPids] = {0};
    uint8_t keyQueryCount_{0};
    uint8_t keyQueryCursor_{0};
    uint8_t bgQueryPids_[kMaxQueryPids] = {0};
    uint8_t bgQueryCount_{0};
    uint8_t bgQueryCursor_{0};
    ObdPidHealth pidHealth_[256];

    uint8_t mode09Cursor_{0};

    uint32_t lastSupportMs_{0};
    uint32_t lastDiscoveryRefreshMs_{0};
    ObdSchedulerState scheduler_{};

    uint32_t txWindow_{0};
    uint32_t respWindow_{0};
    uint32_t decodedWindow_{0};
    uint32_t totalResponses_{0};
    uint32_t keyQueryWindow_{0};
    uint32_t bgQueryWindow_{0};

    Mode01Route mode01Route_{Mode01Route::StdFunctional7DF};
    Mode01Route mode01ReprobeReturnRoute_{Mode01Route::StdFunctional7DF};
    uint32_t mode01RouteSinceMs_{0};
    uint32_t mode01LastResponseMs_{0};
    uint32_t mode01ResponseStreakStartMs_{0};
    uint32_t mode01RouteLockUntilMs_{0};
    uint32_t mode01LastProbeMs_{0};
    uint32_t mode01ReprobeUntilMs_{0};
    bool mode01ReprobeActive_{false};
    bool mode01BootstrapActive_{true};

    uint16_t supportedCount_{0};

    ObdMetric metrics_[256];
    ObdVehicleInfo vehicle_{};
    ObdCompactSample compactSample_{};
    uint32_t compactLastUpdateMs_[9] = {0};

    // Indexed by frame number (1..15) for simple ISO-TP style chunk assembly.
    uint8_t vinChunkLen_[16] = {0};
    char vinChunks_[16][5] = {{0}};
    uint8_t calidChunkLen_[16] = {0};
    char calidChunks_[16][5] = {{0}};
    uint8_t cvnChunkLen_[16] = {0};
    uint8_t cvnChunks_[16][4] = {{0}};
};
