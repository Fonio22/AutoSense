#pragma once

#include <Arduino.h>
#include <esp32_can.h>

struct ObdMetric
{
    uint8_t mode{1};
    uint8_t pid{0};
    bool supported{false};
    bool decoded{false};
    bool warn{false};
    bool error{false};
    uint32_t lastUpdateMs{0};
    uint32_t lastChangeMs{0};
    uint32_t firstUpdateMs{0};
    uint32_t updateCount{0};
    uint32_t avgIntervalMs{0};
    char key[20]{0};
    char value[24]{0};
    char unit[12]{0};
    char formula[28]{0};
    char raw[24]{0};
    char category[14]{0};
    char notes[28]{0};
};

struct ObdMode09EcuInfo
{
    uint32_t responseId{0};
    bool extended{false};
    char vin[24]{0};
    char calid[40]{0};
    char cvn[24]{0};
    char ecuName[40]{0};
    char iptRaw[40]{0};
    uint32_t lastUpdateMs{0};
    uint32_t lastVinMs{0};
    uint32_t lastCalIdMs{0};
    uint32_t lastCvnMs{0};
    uint32_t lastEcuNameMs{0};
    uint32_t lastIptMs{0};
};

struct ObdVehicleInfo
{
    static constexpr uint8_t kMaxMode09Ecus = 4;

    char vin[24]{0};
    char calid[40]{0};
    char cvn[24]{0};
    char ecuName[40]{0};
    char iptRaw[40]{0};
    char profile[20]{"generic"};
    uint8_t dtcCount{0};
    char dtcs[8][6]{{0}};
    uint8_t storedDtcCount{0};
    char storedDtcs[8][6]{{0}};
    uint8_t pendingDtcCount{0};
    char pendingDtcs[8][6]{{0}};
    uint8_t permanentDtcCount{0};
    char permanentDtcs[8][6]{{0}};
    char storedDtcRaw[40]{0};
    char pendingDtcRaw[40]{0};
    char permanentDtcRaw[40]{0};
    char freezeFrameRaw[40]{0};
    char mode06Raw[40]{0};
    char mode06Summary[56]{0};
    uint8_t mode06LastTid{0};
    uint8_t mode06SupportedCount{0};
    uint8_t mode09EcuCount{0};
    ObdMode09EcuInfo mode09Ecus[kMaxMode09Ecus]{};
    uint32_t lastVinMs{0};
    uint32_t lastCalIdMs{0};
    uint32_t lastCvnMs{0};
    uint32_t lastEcuNameMs{0};
    uint32_t lastIptMs{0};
    uint32_t lastFreezeFrameMs{0};
    uint32_t lastMode06Ms{0};
    uint32_t lastDtcMs{0};
    uint32_t lastPendingDtcMs{0};
    uint32_t lastPermanentDtcMs{0};
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
    OBD_SAMPLE_INTAKE_AIR = 1U << 9,
    OBD_SAMPLE_SPARK_ADVANCE = 1U << 10,
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
    int16_t intakeAirC{0};
    int16_t sparkAdvanceDeg10{0};
};

struct ObdProfileSignalConfig
{
    uint8_t pid{0};
    uint16_t pollMs{1000};
    bool required{false};
    bool enabled{true};
};

struct ObdRuntimeProfile
{
    static constexpr uint8_t kMaxSignals = 32;

    char profileId[40]{"generic_obd2"};
    char version[16]{"0.0.0"};
    ObdProfileSignalConfig signals[kMaxSignals]{};
    uint8_t signalCount{0};
    bool extendedReadOnly{false};
};

class ObdService
{
public:
    void begin();
    void setActiveQuery(bool enabled);
    void setDiagnosticInfoEnabled(bool enabled);
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
    uint32_t readGuardBlocked() const;

    uint16_t collectMetrics(ObdMetric *out, uint16_t maxOut) const;
    uint16_t collectSupportedPids(uint8_t *out, uint16_t maxOut) const;
    bool collectCompactSample(uint32_t nowMs, uint32_t maxAgeMs, ObdCompactSample *out) const;
    const ObdVehicleInfo &vehicleInfo() const;
    void applyRuntimeProfile(const ObdRuntimeProfile &profile);
    const ObdRuntimeProfile &runtimeProfile() const;
    bool hasRuntimeProfile() const;

    void clearWindowCounters();

private:
    static constexpr uint8_t kMaxPid = 0xE0;
    static constexpr uint16_t kMode01PidCount = kMaxPid + 1;
    static constexpr uint8_t kMaxQueryPids = 224;
    static constexpr uint8_t kMaxKeyPids = 16;
    static constexpr uint8_t kPidBitmapWords = 8;

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
        uint32_t lastMode02Ms{0};
        uint32_t lastMode06Ms{0};
        uint32_t lastMode03Ms{0};
        uint32_t lastMode07Ms{0};
        uint32_t lastMode0AMs{0};
        uint32_t lastMode09Ms{0};
    };

    struct ObdPidHealth
    {
        uint32_t lastReqMs{0};
        uint32_t lastRspMs{0};
        uint16_t missCount{0};
        bool active{false};
    };

    struct IsoTpRxState
    {
        bool active{false};
        bool extended{false};
        uint32_t responseId{0};
        uint32_t flowControlId{0};
        uint16_t expectedLen{0};
        uint16_t len{0};
        uint8_t nextSeq{1};
        uint8_t payload[96]{0};
    };

    struct Mode09ChunkState
    {
        uint32_t responseId{0};
        bool extended{false};
        uint8_t vinChunkLen[16]{0};
        char vinChunks[16][5]{{0}};
        uint8_t calidChunkLen[16]{0};
        char calidChunks[16][5]{{0}};
        uint8_t cvnChunkLen[16]{0};
        uint8_t cvnChunks[16][4]{{0}};
    };

    void sendMode01Request(uint8_t pid, uint32_t nowMs);
    void sendMode02Request(uint8_t pid);
    void sendMode03Request();
    void sendMode06Request(uint8_t tid);
    void sendMode07Request();
    void sendMode0ARequest();
    void sendMode09Request(uint8_t pid);
    void sendRequestFrame(uint32_t id, bool extended, uint8_t lenByte, uint8_t service, uint8_t pid);

    bool decodeMode01Pid(uint8_t pid, const uint8_t *data, uint8_t dataLen, uint32_t nowMs);
    bool parseDtcResponse(const CAN_FRAME &frame,
                          uint8_t positiveService,
                          uint8_t *count,
                          char dtcs[8][6],
                          char *raw,
                          size_t rawSize,
                          uint32_t *lastUpdateMs,
                          uint32_t nowMs);
    bool parseRawServiceResponse(const CAN_FRAME &frame,
                                 uint8_t positiveService,
                                 char *raw,
                                 size_t rawSize,
                                 uint32_t *lastUpdateMs,
                                 uint32_t nowMs);
    bool parseMode06(const CAN_FRAME &frame, uint32_t nowMs);
    bool parseMode06Payload(const uint8_t *payload, uint16_t payloadLen, uint32_t nowMs);
    bool parseMode09(const CAN_FRAME &frame, uint32_t nowMs);
    bool parseMode09Payload(uint32_t responseId, bool extended, const uint8_t *payload, uint16_t payloadLen, bool fullPayload, uint32_t nowMs);
    bool handleIsoTpFrame(const CAN_FRAME &frame, uint32_t nowMs);
    bool handleIsoTpPayload(uint32_t responseId, const uint8_t *payload, uint16_t payloadLen, uint32_t nowMs);
    bool sendIsoTpFlowControl(const CAN_FRAME &firstFrame);
    static uint8_t singleFramePayloadLen(const CAN_FRAME &frame);

    static bool isObdResponseFrame(const CAN_FRAME &frame);
    static bool isMode01Response(const CAN_FRAME &frame);
    static bool isMode02Response(const CAN_FRAME &frame);
    static bool isMode03Response(const CAN_FRAME &frame);
    static bool isMode06Response(const CAN_FRAME &frame);
    static bool isMode07Response(const CAN_FRAME &frame);
    static bool isMode0AResponse(const CAN_FRAME &frame);
    static bool isMode09Response(const CAN_FRAME &frame);
    static bool isSupportBitmapPid(uint8_t pid);
    static bool pidBit(const uint32_t *bits, uint8_t pid);
    static bool setPidBit(uint32_t *bits, uint8_t pid);

    void resetDiscovery();
    void rebuildQueryPlan();
    bool addRuntimeProfilePids(bool supportedOnly);
    bool addKeyPid(uint8_t pid);
    bool addBgPid(uint8_t pid);
    void handleSupportedBitmap(uint8_t pid, const uint8_t *data, uint8_t dataLen, uint32_t nowMs);
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
    void recordMetricRaw(uint8_t pid, const uint8_t *data, uint8_t dataLen, uint32_t nowMs);
    void markCompactField(uint8_t fieldIndex, uint32_t nowMs);

    void parseMode09Support(const uint8_t *data, uint8_t dataLen);
    void parseMode06Support(uint8_t tid, const uint8_t *data, uint8_t dataLen);
    uint8_t nextMode06Tid();
    void updateVehicleProfile();
    ObdMode09EcuInfo *mode09EcuForResponse(uint32_t responseId, bool extended);
    void resetMode09Chunks(uint8_t slot);
    void mirrorPrimaryMode09(const ObdMode09EcuInfo &ecu);
    void updateMode09AsciiChunks(char *target,
                                 size_t targetSize,
                                 uint8_t *chunkLens,
                                 char chunks[16][5],
                                 uint8_t frameIdx,
                                 const uint8_t *payload,
                                 uint8_t payloadLen,
                                 uint32_t nowMs,
                                 uint32_t *lastUpdateMs,
                                 bool updateProfile);
    void updateMode09HexChunks(char *target,
                               size_t targetSize,
                               uint8_t *chunkLens,
                               uint8_t chunks[16][4],
                               uint8_t frameIdx,
                               const uint8_t *payload,
                               uint8_t payloadLen,
                               uint32_t nowMs,
                               uint32_t *lastUpdateMs);
    void updateMode09Ascii(char *target,
                           size_t targetSize,
                           uint8_t *chunkLens,
                           uint8_t frameIdx,
                           const uint8_t *payload,
                           uint8_t payloadLen,
                           uint32_t nowMs,
                           uint32_t *lastUpdateMs);
    void updateMode09FullAscii(char *target,
                               size_t targetSize,
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
    void updateMode09FullHex(char *target,
                             size_t targetSize,
                             const uint8_t *payload,
                             uint8_t payloadLen,
                             uint32_t nowMs,
                             uint32_t *lastUpdateMs);

    bool activeQuery_{false};
    bool discoveryComplete_{false};
    bool diagnosticInfoEnabled_{true};
    bool runtimeProfileActive_{false};
    ObdRuntimeProfile runtimeProfile_{};

    bool supportAnswered_[7] = {false, false, false, false, false, false, false};
    uint32_t supported_[kPidBitmapWords] = {0};
    uint32_t rawSeen_[kPidBitmapWords] = {0};

    uint32_t mode09Supported_[kPidBitmapWords] = {0};
    bool mode09SupportKnown_{false};
    uint32_t mode06Supported_[kPidBitmapWords] = {0};

    uint8_t supportCursor_{0};
    uint8_t keyQueryPids_[kMaxKeyPids] = {0};
    uint8_t keyQueryCount_{0};
    uint8_t keyQueryCursor_{0};
    uint8_t bgQueryPids_[kMaxQueryPids] = {0};
    uint8_t bgQueryCount_{0};
    uint8_t bgQueryCursor_{0};
    ObdPidHealth pidHealth_[kMode01PidCount];

    uint8_t mode09Cursor_{0};
    uint8_t mode06SupportCursor_{0};
    uint8_t mode06TidCursor_{1};
    bool mode06DiscoveryComplete_{false};

    uint32_t lastSupportMs_{0};
    uint32_t lastDiscoveryRefreshMs_{0};
    ObdSchedulerState scheduler_{};

    uint32_t txWindow_{0};
    uint32_t respWindow_{0};
    uint32_t decodedWindow_{0};
    uint32_t totalResponses_{0};
    uint32_t keyQueryWindow_{0};
    uint32_t bgQueryWindow_{0};
    uint32_t readGuardBlocked_{0};
    uint32_t isoTpFlowControlBlocked_{0};

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

    ObdMetric metrics_[kMode01PidCount];
    ObdVehicleInfo vehicle_{};
    ObdCompactSample compactSample_{};
    uint32_t compactLastUpdateMs_[11] = {0};
    IsoTpRxState isoTpRx_{};

    // Indexed by frame number (1..15) for simple ISO-TP style chunk assembly.
    uint8_t vinChunkLen_[16] = {0};
    char vinChunks_[16][5] = {{0}};
    uint8_t calidChunkLen_[16] = {0};
    char calidChunks_[16][5] = {{0}};
    uint8_t cvnChunkLen_[16] = {0};
    uint8_t cvnChunks_[16][4] = {{0}};
    Mode09ChunkState mode09Chunks_[ObdVehicleInfo::kMaxMode09Ecus]{};
};
