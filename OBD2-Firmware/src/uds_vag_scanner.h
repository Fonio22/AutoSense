#pragma once

#include <Arduino.h>
#include <esp32_can.h>

struct UdsVagModuleStatus
{
    char address[4]{0};
    char name[18]{0};
    uint32_t requestId{0};
    uint32_t responseId{0};
    bool present{false};
    bool complete{false};
    uint8_t negativeResponses{0};
    uint8_t timeouts{0};
    uint8_t dtcCount{0};
    char partNumber[24]{0};
    char swNumber[24]{0};
    char swVersion[20]{0};
    char supplier[18]{0};
    char hwNumber[24]{0};
    char systemName[20]{0};
    char dtcs[6][10]{{0}};
    char dtcRaw[48]{0};
    char snapshotRaw[48]{0};
    char lastError[24]{0};
    uint32_t lastUpdateMs{0};
};

class UdsVagScanner
{
public:
    static constexpr uint8_t kMaxModules = 14;

    struct ModuleRoute
    {
        uint32_t requestId;
        uint32_t responseId;
    };

    struct ModuleDef
    {
        const char *address;
        const char *name;
        const ModuleRoute *routes;
        uint8_t routeCount;
    };

    void begin();
    void tick(uint32_t nowMs, bool canReady, bool enableProfile);
    bool handleFrame(const CAN_FRAME &frame, uint32_t nowMs);

    uint8_t collectModules(UdsVagModuleStatus *out, uint8_t maxOut) const;
    uint32_t blockedCount() const;
    bool enabled() const;
    bool active() const;

private:
    enum class RequestState : uint8_t
    {
        Idle = 0,
        Waiting = 1,
    };

    enum class Operation : uint8_t
    {
        ReadPartNumber = 0,
        ReadSoftwareNumber = 1,
        ReadSoftwareVersion = 2,
        ReadSupplier = 3,
        ReadVin = 4,
        ReadHardwareNumber = 5,
        ReadSystemName = 6,
        ReadDtcByStatus = 7,
        ReadSnapshotIds = 8,
        Done = 9,
    };

    void resetScan(uint32_t nowMs);
    void advanceOperation(uint32_t nowMs);
    void advanceUnconfirmedOperation(uint32_t nowMs);
    void advanceRouteOrModule(uint32_t nowMs);
    bool sendCurrentRequest(uint32_t nowMs);
    bool sendUdsSingleFrame(const ModuleRoute &route, const uint8_t *payload, uint8_t len);
    bool sendFlowControl(const ModuleRoute &route);
    bool handleCompletePayload(const uint8_t *payload, uint16_t len, uint32_t nowMs);
    void handlePositiveReadData(const uint8_t *payload, uint16_t len, UdsVagModuleStatus &status, uint32_t nowMs);
    void handlePositiveReadDtc(const uint8_t *payload, uint16_t len, UdsVagModuleStatus &status, uint32_t nowMs);
    void markNegative(const uint8_t *payload, uint16_t len, UdsVagModuleStatus &status, uint32_t nowMs);
    void markTimeout(uint32_t nowMs);
    void storeAscii(char *dst, size_t dstSize, const uint8_t *data, uint16_t len);
    void storeHex(char *dst, size_t dstSize, const uint8_t *data, uint16_t len);
    void decodeUdsDtc(uint32_t dtc, char out[10]);

    static const ModuleDef *moduleDefs();
    static uint8_t moduleCount();
    static uint16_t didForOperation(Operation operation);
    const ModuleRoute &currentRoute() const;

    bool enabled_{false};
    RequestState state_{RequestState::Idle};
    uint8_t moduleIndex_{0};
    uint8_t routeIndex_{0};
    Operation operation_{Operation::ReadPartNumber};
    uint32_t nextRequestMs_{0};
    uint32_t requestStartedMs_{0};
    uint32_t lastFullScanMs_{0};
    uint32_t blockedCount_{0};
    uint8_t responsePendingCount_{0};

    uint16_t rxExpectedLen_{0};
    uint16_t rxLen_{0};
    uint8_t rxNextSeq_{1};
    uint8_t rxPayload_[180]{0};

    UdsVagModuleStatus modules_[kMaxModules]{};
};
