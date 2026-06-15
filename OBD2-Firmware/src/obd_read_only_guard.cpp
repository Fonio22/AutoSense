#include "obd_read_only_guard.h"

namespace
{
constexpr uint8_t kSafeStandardObd[] = {
    0x01, // current data
    0x02, // freeze frame
    0x03, // stored DTCs
    0x06, // onboard monitoring
    0x07, // pending DTCs
    0x09, // vehicle information
    0x0A, // permanent DTCs
};

constexpr uint8_t kBlockedStandardObd[] = {
    0x04, // clear/reset emission data
    0x08, // control operation
};

constexpr uint8_t kSafeUds[] = {
    0x19, // ReadDTCInformation
    0x22, // ReadDataByIdentifier
};

constexpr uint8_t kBlockedUds[] = {
    0x10, // DiagnosticSessionControl changes session state
    0x11, // ECUReset
    0x14, // ClearDiagnosticInformation
    0x23, // ReadMemoryByAddress blocked by no ECU memory dump rule
    0x27, // SecurityAccess
    0x28, // CommunicationControl
    0x2A, // ReadDataByPeriodicIdentifier starts periodic behavior
    0x2C, // DynamicallyDefineDataIdentifier
    0x2E, // WriteDataByIdentifier
    0x2F, // InputOutputControlByIdentifier
    0x31, // RoutineControl
    0x34, // RequestDownload
    0x35, // RequestUpload
    0x36, // TransferData
    0x37, // RequestTransferExit
    0x38, // RequestFileTransfer
    0x3D, // WriteMemoryByAddress
    0x3E, // TesterPresent can keep non-default sessions alive
    0x83, // AccessTimingParameter
    0x85, // ControlDTCSetting
    0x87, // LinkControl
};

bool contains(const uint8_t *values, size_t count, uint8_t value)
{
    for (size_t i = 0; i < count; i++)
    {
        if (values[i] == value)
        {
            return true;
        }
    }
    return false;
}

ObdGuardDecision decision(bool allowed, const char *reason)
{
    ObdGuardDecision out;
    out.allowed = allowed;
    out.reason = reason;
    return out;
}
} // namespace

bool ObdReadOnlyGuard::isSafeStandardObd(uint8_t service)
{
    return contains(kSafeStandardObd, sizeof(kSafeStandardObd), service);
}

bool ObdReadOnlyGuard::isBlockedStandardObd(uint8_t service)
{
    return contains(kBlockedStandardObd, sizeof(kBlockedStandardObd), service);
}

bool ObdReadOnlyGuard::isSafeUds(uint8_t service)
{
    return contains(kSafeUds, sizeof(kSafeUds), service);
}

bool ObdReadOnlyGuard::isBlockedUds(uint8_t service)
{
    return contains(kBlockedUds, sizeof(kBlockedUds), service);
}

ObdGuardDecision ObdReadOnlyGuard::check(const ObdGuardRequest &request)
{
    if (request.family == ObdCommandFamily::IsoTpFlowControl)
    {
        return decision(true, "SAFE_READ ISO-TP flow control");
    }

    if (request.family == ObdCommandFamily::StandardObd)
    {
        if (isBlockedStandardObd(request.service))
        {
            return decision(false, "blocked OBD write/control service");
        }
        if (isSafeStandardObd(request.service))
        {
            return decision(true, "SAFE_READ standard OBD");
        }
        return decision(false, "standard OBD service not in SAFE_READ");
    }

    if (isBlockedUds(request.service))
    {
        return decision(false, "blocked UDS write/session/control service");
    }
    if (isSafeUds(request.service))
    {
        return decision(true, "SAFE_READ UDS");
    }
    return decision(false, "UDS service not in SAFE_READ");
}

void ObdReadOnlyGuard::printPolicy(Stream &out)
{
    out.println("[readOnlyGuard] SAFE_READ:");
    out.println("  OBD: 01 current data, 02 freeze frame, 03 stored DTC, 06 onboard monitor, 07 pending DTC, 09 vehicle info, 0A permanent DTC");
    out.println("  UDS: 19 ReadDTCInformation, 22 ReadDataByIdentifier");
    out.println("  ISO-TP: flow-control frames only after a first-frame response");
    out.println("[readOnlyGuard] BLOCKED_WRITE_RISK:");
    out.println("  OBD: 04 clear/reset emissions data, 08 control operation");
    out.println("  UDS: 10 session, 11 reset, 14 clear DTC, 23 read memory dump, 27 security, 28 comm control, 2A periodic, 2C dynamic DID,");
    out.println("       2E write DID, 2F IO control, 31 routine, 34/35/36/37/38 transfer, 3D write memory, 3E tester-present, 83 timing, 85 DTC setting, 87 link control");
}
