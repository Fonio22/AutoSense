#include "uds_vag_scanner.h"

#include <new>
#include <string.h>

#include "obd_read_only_guard.h"

namespace
{
constexpr uint32_t kRequestSpacingMs = 1200;
constexpr uint32_t kRequestTimeoutMs = 1600;
constexpr uint32_t kFullScanIntervalMs = 300000;
constexpr uint8_t kMaxResponsePending = 4;

constexpr UdsVagScanner::ModuleRoute kEngineRoutes[] = {
    {0x7E0, 0x7E8},
};
constexpr UdsVagScanner::ModuleRoute kTransRoutes[] = {
    {0x7E1, 0x7E9},
};
constexpr UdsVagScanner::ModuleRoute kAbsRoutes[] = {
    {0x713, 0x77D},
    {0x713, 0x71B},
};
constexpr UdsVagScanner::ModuleRoute kHvacRoutes[] = {
    {0x746, 0x7B0},
    {0x746, 0x74E},
};
constexpr UdsVagScanner::ModuleRoute kBcmRoutes[] = {
    {0x70E, 0x778},
    {0x70E, 0x716},
};
constexpr UdsVagScanner::ModuleRoute kAirbagRoutes[] = {
    {0x715, 0x77F},
    {0x715, 0x71D},
};
constexpr UdsVagScanner::ModuleRoute kClusterRoutes[] = {
    {0x714, 0x77E},
    {0x714, 0x71C},
};
constexpr UdsVagScanner::ModuleRoute kGatewayRoutes[] = {
    {0x710, 0x77A},
    {0x710, 0x718},
};
constexpr UdsVagScanner::ModuleRoute kSteeringRoutes[] = {
    {0x712, 0x77C},
    {0x712, 0x71A},
};
constexpr UdsVagScanner::ModuleRoute kComfortRoutes[] = {
    {0x70D, 0x777},
    {0x70D, 0x715},
};
constexpr UdsVagScanner::ModuleRoute kParkBrakeRoutes[] = {
    {0x752, 0x7BC},
    {0x752, 0x75A},
};
constexpr UdsVagScanner::ModuleRoute kInfotainRoutes[] = {
    {0x773, 0x7DD},
    {0x773, 0x77B},
};
constexpr UdsVagScanner::ModuleRoute kTpmsRoutes[] = {
    {0x70B, 0x775},
    {0x70B, 0x713},
};
constexpr UdsVagScanner::ModuleRoute kSteerColRoutes[] = {
    {0x70C, 0x776},
    {0x70C, 0x714},
};

#define ROUTES(name) name, (uint8_t)(sizeof(name) / sizeof((name)[0]))

constexpr UdsVagScanner::ModuleDef kModules[] = {
    {"01", "Engine", ROUTES(kEngineRoutes)},
    {"02", "Trans", ROUTES(kTransRoutes)},
    {"03", "ABS", ROUTES(kAbsRoutes)},
    {"08", "HVAC", ROUTES(kHvacRoutes)},
    {"09", "BCM", ROUTES(kBcmRoutes)},
    {"15", "Airbag", ROUTES(kAirbagRoutes)},
    {"17", "Cluster", ROUTES(kClusterRoutes)},
    {"19", "Gateway", ROUTES(kGatewayRoutes)},
    {"44", "Steering", ROUTES(kSteeringRoutes)},
    {"46", "Comfort", ROUTES(kComfortRoutes)},
    {"53", "ParkBrake", ROUTES(kParkBrakeRoutes)},
    {"5F", "Infotain", ROUTES(kInfotainRoutes)},
    {"65", "TPMS", ROUTES(kTpmsRoutes)},
    {"16", "SteerCol", ROUTES(kSteerColRoutes)},
};
#undef ROUTES

void initStatusFromDef(UdsVagModuleStatus &status, const UdsVagScanner::ModuleDef &def)
{
    memset(&status, 0, sizeof(status));
    snprintf(status.address, sizeof(status.address), "%s", def.address);
    snprintf(status.name, sizeof(status.name), "%s", def.name);
    if (def.routes && def.routeCount > 0)
    {
        status.requestId = def.routes[0].requestId;
        status.responseId = def.routes[0].responseId;
    }
}

uint8_t safeCopyCount(uint16_t available, uint16_t wanted)
{
    uint16_t count = available < wanted ? available : wanted;
    return count > 255 ? 255 : (uint8_t)count;
}
} // namespace

const UdsVagScanner::ModuleDef *UdsVagScanner::moduleDefs()
{
    return kModules;
}

uint8_t UdsVagScanner::moduleCount()
{
    return (uint8_t)(sizeof(kModules) / sizeof(kModules[0]));
}

uint16_t UdsVagScanner::didForOperation(Operation operation)
{
    switch (operation)
    {
    case Operation::ReadPartNumber:
        return 0xF187;
    case Operation::ReadSoftwareNumber:
        return 0xF188;
    case Operation::ReadSoftwareVersion:
        return 0xF189;
    case Operation::ReadSupplier:
        return 0xF18A;
    case Operation::ReadVin:
        return 0xF190;
    case Operation::ReadHardwareNumber:
        return 0xF191;
    case Operation::ReadSystemName:
        return 0xF197;
    default:
        return 0;
    }
}

const UdsVagScanner::ModuleRoute &UdsVagScanner::currentRoute() const
{
    const ModuleDef &module = moduleDefs()[moduleIndex_];
    uint8_t route = routeIndex_;
    if (!module.routes || module.routeCount == 0)
    {
        return kEngineRoutes[0];
    }
    if (route >= module.routeCount)
    {
        route = 0;
    }
    return module.routes[route];
}

void UdsVagScanner::begin()
{
    enabled_ = false;
}

bool UdsVagScanner::enabled() const
{
    return enabled_;
}

bool UdsVagScanner::active() const
{
    return state_ == RequestState::Waiting;
}

uint32_t UdsVagScanner::blockedCount() const
{
    return blockedCount_;
}

uint8_t UdsVagScanner::collectModules(UdsVagModuleStatus *out, uint8_t maxOut) const
{
    if (!out || maxOut == 0)
    {
        return 0;
    }

    uint8_t count = 0;
    uint8_t total = moduleCount();
    for (uint8_t i = 0; i < total && count < maxOut; i++)
    {
        if (modules_)
        {
            out[count++] = modules_[i];
        }
        else
        {
            initStatusFromDef(out[count++], moduleDefs()[i]);
        }
    }
    return count;
}

bool UdsVagScanner::ensureModules()
{
    if (!modules_)
    {
        modules_ = new (std::nothrow) UdsVagModuleStatus[kMaxModules]();
    }
    return modules_ != nullptr;
}

void UdsVagScanner::releaseModules()
{
    delete[] modules_;
    modules_ = nullptr;
}

void UdsVagScanner::resetScan(uint32_t nowMs)
{
    if (!ensureModules())
    {
        enabled_ = false;
        state_ = RequestState::Idle;
        return;
    }

    const ModuleDef *defs = moduleDefs();
    uint8_t total = moduleCount();
    for (uint8_t i = 0; i < total && i < kMaxModules; i++)
    {
        initStatusFromDef(modules_[i], defs[i]);
    }

    moduleIndex_ = 0;
    routeIndex_ = 0;
    operation_ = Operation::ReadPartNumber;
    state_ = RequestState::Idle;
    nextRequestMs_ = nowMs + 3000;
    requestStartedMs_ = 0;
    responsePendingCount_ = 0;
    rxExpectedLen_ = 0;
    rxLen_ = 0;
    rxNextSeq_ = 1;
}

void UdsVagScanner::tick(uint32_t nowMs, bool canReady, bool enableProfile)
{
    if (!canReady || !enableProfile)
    {
        enabled_ = false;
        state_ = RequestState::Idle;
        releaseModules();
        return;
    }

    if (!enabled_)
    {
        if (!ensureModules())
        {
            return;
        }
        enabled_ = true;
        resetScan(nowMs);
    }

    if (state_ == RequestState::Waiting)
    {
        if (nowMs - requestStartedMs_ >= kRequestTimeoutMs)
        {
            markTimeout(nowMs);
            advanceOperation(nowMs);
        }
        return;
    }

    if (moduleIndex_ >= moduleCount())
    {
        if (lastFullScanMs_ == 0)
        {
            lastFullScanMs_ = nowMs;
        }
        if (nowMs - lastFullScanMs_ >= kFullScanIntervalMs)
        {
            resetScan(nowMs);
            lastFullScanMs_ = nowMs;
        }
        return;
    }

    if (nowMs < nextRequestMs_)
    {
        return;
    }

    sendCurrentRequest(nowMs);
}

bool UdsVagScanner::sendCurrentRequest(uint32_t nowMs)
{
    if (!modules_ || moduleIndex_ >= moduleCount())
    {
        return false;
    }

    const ModuleRoute &route = currentRoute();
    uint8_t payload[4] = {0};
    uint8_t len = 0;

    uint16_t did = didForOperation(operation_);
    if (did != 0)
    {
        payload[0] = 0x22;
        payload[1] = (uint8_t)(did >> 8);
        payload[2] = (uint8_t)did;
        len = 3;
    }
    else if (operation_ == Operation::ReadDtcByStatus)
    {
        payload[0] = 0x19;
        payload[1] = 0x02;
        payload[2] = 0xFF;
        len = 3;
    }
    else if (operation_ == Operation::ReadSnapshotIds)
    {
        payload[0] = 0x19;
        payload[1] = 0x03;
        len = 2;
    }
    else
    {
        advanceOperation(nowMs);
        return false;
    }

    rxExpectedLen_ = 0;
    rxLen_ = 0;
    rxNextSeq_ = 1;
    responsePendingCount_ = 0;

    modules_[moduleIndex_].requestId = route.requestId;
    modules_[moduleIndex_].responseId = route.responseId;

    if (!sendUdsSingleFrame(route, payload, len))
    {
        blockedCount_++;
        snprintf(modules_[moduleIndex_].lastError, sizeof(modules_[moduleIndex_].lastError), "guard-block");
        advanceOperation(nowMs);
        return false;
    }

    state_ = RequestState::Waiting;
    requestStartedMs_ = nowMs;
    return true;
}

bool UdsVagScanner::sendUdsSingleFrame(const ModuleRoute &route, const uint8_t *payload, uint8_t len)
{
    if (!payload || len == 0 || len > 7)
    {
        return false;
    }

    ObdGuardRequest guardRequest{};
    guardRequest.family = ObdCommandFamily::Uds;
    guardRequest.service = payload[0];
    guardRequest.pidOrSubFunction = len > 1 ? payload[1] : 0;
    guardRequest.canId = route.requestId;
    guardRequest.extended = false;
    ObdGuardDecision decision = ObdReadOnlyGuard::check(guardRequest);
    if (!decision.allowed)
    {
        return false;
    }

    CAN_FRAME req;
    req.id = route.requestId;
    req.extended = 0;
    req.rtr = 0;
    req.length = 8;
    memset(req.data.byte, 0, sizeof(req.data.byte));
    req.data.byte[0] = len;
    for (uint8_t i = 0; i < len; i++)
    {
        req.data.byte[1 + i] = payload[i];
    }
    return CAN0.sendFrame(req);
}

bool UdsVagScanner::sendFlowControl(const ModuleRoute &route)
{
    ObdGuardRequest guardRequest{};
    guardRequest.family = ObdCommandFamily::IsoTpFlowControl;
    guardRequest.canId = route.requestId;
    guardRequest.extended = false;
    ObdGuardDecision decision = ObdReadOnlyGuard::check(guardRequest);
    if (!decision.allowed)
    {
        blockedCount_++;
        return false;
    }

    CAN_FRAME fc;
    fc.id = route.requestId;
    fc.extended = 0;
    fc.rtr = 0;
    fc.length = 8;
    memset(fc.data.byte, 0, sizeof(fc.data.byte));
    fc.data.byte[0] = 0x30; // Continue To Send, block size 0, STmin 0.
    return CAN0.sendFrame(fc);
}

bool UdsVagScanner::handleFrame(const CAN_FRAME &frame, uint32_t nowMs)
{
    if (!modules_ || !enabled_ || state_ != RequestState::Waiting || moduleIndex_ >= moduleCount())
    {
        return false;
    }
    const ModuleRoute &route = currentRoute();
    if (frame.rtr || frame.extended || frame.id != route.responseId || frame.length < 2)
    {
        return false;
    }

    uint8_t pci = frame.data.byte[0];
    uint8_t type = pci & 0xF0;

    if (type == 0x00)
    {
        uint8_t len = pci & 0x0F;
        if (len > frame.length - 1)
        {
            len = frame.length - 1;
        }
        if (handleCompletePayload(&frame.data.byte[1], len, nowMs))
        {
            advanceOperation(nowMs);
            return true;
        }
        return false;
    }

    if (type == 0x10 && frame.length >= 3)
    {
        rxExpectedLen_ = (uint16_t)(((uint16_t)(pci & 0x0F) << 8) | frame.data.byte[1]);
        if (rxExpectedLen_ > sizeof(rxPayload_))
        {
            rxExpectedLen_ = sizeof(rxPayload_);
        }
        rxLen_ = safeCopyCount(frame.length - 2, rxExpectedLen_);
        memcpy(rxPayload_, &frame.data.byte[2], rxLen_);
        rxNextSeq_ = 1;
        sendFlowControl(route);
        if (rxLen_ >= rxExpectedLen_)
        {
            if (handleCompletePayload(rxPayload_, rxLen_, nowMs))
            {
                advanceOperation(nowMs);
            }
        }
        return true;
    }

    if (type == 0x20 && rxExpectedLen_ > 0)
    {
        uint8_t seq = pci & 0x0F;
        if (seq != rxNextSeq_)
        {
            snprintf(modules_[moduleIndex_].lastError, sizeof(modules_[moduleIndex_].lastError), "seq-mismatch");
            advanceOperation(nowMs);
            return true;
        }
        rxNextSeq_ = (uint8_t)((rxNextSeq_ + 1) & 0x0F);

        uint16_t remaining = rxExpectedLen_ > rxLen_ ? (rxExpectedLen_ - rxLen_) : 0;
        uint8_t copyLen = safeCopyCount(frame.length - 1, remaining);
        if (copyLen > 0)
        {
            memcpy(&rxPayload_[rxLen_], &frame.data.byte[1], copyLen);
            rxLen_ += copyLen;
        }
        if (rxLen_ >= rxExpectedLen_)
        {
            if (handleCompletePayload(rxPayload_, rxLen_, nowMs))
            {
                advanceOperation(nowMs);
            }
        }
        return true;
    }

    return false;
}

bool UdsVagScanner::handleCompletePayload(const uint8_t *payload, uint16_t len, uint32_t nowMs)
{
    if (!modules_ || !payload || len == 0 || moduleIndex_ >= moduleCount())
    {
        return false;
    }

    UdsVagModuleStatus &status = modules_[moduleIndex_];

    if (payload[0] == 0x7F)
    {
        if (len < 2 || (payload[1] != 0x22 && payload[1] != 0x19))
        {
            return false;
        }
        status.present = true;
        status.lastUpdateMs = nowMs;
        if (len >= 3 && payload[2] == 0x78 && responsePendingCount_ < kMaxResponsePending)
        {
            responsePendingCount_++;
            requestStartedMs_ = nowMs;
            snprintf(status.lastError, sizeof(status.lastError), "pending");
            return false;
        }
        markNegative(payload, len, status, nowMs);
        return true;
    }

    if (payload[0] == 0x62)
    {
        status.present = true;
        status.lastUpdateMs = nowMs;
        handlePositiveReadData(payload, len, status, nowMs);
        return true;
    }

    if (payload[0] == 0x59)
    {
        status.present = true;
        status.lastUpdateMs = nowMs;
        handlePositiveReadDtc(payload, len, status, nowMs);
        return true;
    }

    return false;
}

void UdsVagScanner::handlePositiveReadData(const uint8_t *payload, uint16_t len, UdsVagModuleStatus &status, uint32_t nowMs)
{
    if (len < 3)
    {
        snprintf(status.lastError, sizeof(status.lastError), "short-rdbi");
        return;
    }

    uint16_t did = ((uint16_t)payload[1] << 8) | payload[2];
    const uint8_t *data = &payload[3];
    uint16_t dataLen = len - 3;

    switch (did)
    {
    case 0xF187:
        storeAscii(status.partNumber, sizeof(status.partNumber), data, dataLen);
        break;
    case 0xF188:
        storeAscii(status.swNumber, sizeof(status.swNumber), data, dataLen);
        break;
    case 0xF189:
        storeAscii(status.swVersion, sizeof(status.swVersion), data, dataLen);
        break;
    case 0xF18A:
        storeAscii(status.supplier, sizeof(status.supplier), data, dataLen);
        break;
    case 0xF191:
        storeAscii(status.hwNumber, sizeof(status.hwNumber), data, dataLen);
        break;
    case 0xF197:
        storeAscii(status.systemName, sizeof(status.systemName), data, dataLen);
        break;
    default:
        break;
    }
    status.lastUpdateMs = nowMs;
}

void UdsVagScanner::handlePositiveReadDtc(const uint8_t *payload, uint16_t len, UdsVagModuleStatus &status, uint32_t nowMs)
{
    storeHex(payload[1] == 0x03 ? status.snapshotRaw : status.dtcRaw,
             payload[1] == 0x03 ? sizeof(status.snapshotRaw) : sizeof(status.dtcRaw),
             payload,
             len);

    if (len < 3 || payload[1] != 0x02)
    {
        status.lastUpdateMs = nowMs;
        return;
    }

    status.dtcCount = 0;
    memset(status.dtcs, 0, sizeof(status.dtcs));

    uint16_t pos = 3; // byte 2 is DTCStatusAvailabilityMask.
    while (pos + 3 < len && status.dtcCount < 6)
    {
        uint32_t dtc = ((uint32_t)payload[pos] << 16) |
                       ((uint32_t)payload[pos + 1] << 8) |
                       payload[pos + 2];
        uint8_t dtcStatus = payload[pos + 3];
        if (dtc != 0)
        {
            decodeUdsDtc(dtc, status.dtcs[status.dtcCount]);
            size_t used = strlen(status.dtcs[status.dtcCount]);
            snprintf(status.dtcs[status.dtcCount] + used,
                     sizeof(status.dtcs[status.dtcCount]) - used,
                     ":%02X",
                     (unsigned int)dtcStatus);
            status.dtcCount++;
        }
        pos += 4;
    }
    status.lastUpdateMs = nowMs;
}

void UdsVagScanner::markNegative(const uint8_t *payload, uint16_t len, UdsVagModuleStatus &status, uint32_t nowMs)
{
    if (status.negativeResponses < 0xFF)
    {
        status.negativeResponses++;
    }
    if (len >= 3)
    {
        snprintf(status.lastError,
                 sizeof(status.lastError),
                 "nrc %02X/%02X",
                 (unsigned int)payload[1],
                 (unsigned int)payload[2]);
    }
    else
    {
        snprintf(status.lastError, sizeof(status.lastError), "negative");
    }
    status.lastUpdateMs = nowMs;
}

void UdsVagScanner::markTimeout(uint32_t nowMs)
{
    if (!modules_ || moduleIndex_ >= moduleCount())
    {
        return;
    }

    UdsVagModuleStatus &status = modules_[moduleIndex_];
    if (status.timeouts < 0xFF)
    {
        status.timeouts++;
    }
    snprintf(status.lastError, sizeof(status.lastError), "timeout");
    status.lastUpdateMs = nowMs;
}

void UdsVagScanner::advanceOperation(uint32_t nowMs)
{
    state_ = RequestState::Idle;
    rxExpectedLen_ = 0;
    rxLen_ = 0;
    rxNextSeq_ = 1;
    responsePendingCount_ = 0;
    nextRequestMs_ = nowMs + kRequestSpacingMs;

    if (!modules_ || moduleIndex_ >= moduleCount())
    {
        return;
    }

    UdsVagModuleStatus &status = modules_[moduleIndex_];
    if (!status.present)
    {
        advanceUnconfirmedOperation(nowMs);
        return;
    }

    operation_ = (Operation)((uint8_t)operation_ + 1);
    if (operation_ >= Operation::Done)
    {
        status.complete = true;
        moduleIndex_++;
        routeIndex_ = 0;
        operation_ = Operation::ReadPartNumber;
    }
}

void UdsVagScanner::advanceUnconfirmedOperation(uint32_t nowMs)
{
    if (!modules_ || moduleIndex_ >= moduleCount())
    {
        return;
    }

    if (operation_ == Operation::ReadPartNumber)
    {
        operation_ = Operation::ReadDtcByStatus;
        nextRequestMs_ = nowMs + kRequestSpacingMs;
        return;
    }

    if (operation_ == Operation::ReadDtcByStatus)
    {
        operation_ = Operation::ReadVin;
        nextRequestMs_ = nowMs + kRequestSpacingMs;
        return;
    }

    advanceRouteOrModule(nowMs);
}

void UdsVagScanner::advanceRouteOrModule(uint32_t nowMs)
{
    if (!modules_ || moduleIndex_ >= moduleCount())
    {
        return;
    }

    const ModuleDef &module = moduleDefs()[moduleIndex_];
    if (routeIndex_ + 1 < module.routeCount)
    {
        routeIndex_++;
        operation_ = Operation::ReadPartNumber;
        nextRequestMs_ = nowMs + kRequestSpacingMs;
        return;
    }

    modules_[moduleIndex_].complete = true;
    moduleIndex_++;
    routeIndex_ = 0;
    operation_ = Operation::ReadPartNumber;
}

void UdsVagScanner::storeAscii(char *dst, size_t dstSize, const uint8_t *data, uint16_t len)
{
    if (!dst || dstSize == 0)
    {
        return;
    }

    size_t pos = 0;
    for (uint16_t i = 0; i < len && pos + 1 < dstSize; i++)
    {
        char c = (char)data[i];
        if (c < 0x20 || c > 0x7E)
        {
            continue;
        }
        dst[pos++] = c;
    }
    dst[pos] = '\0';
    while (pos > 0 && dst[pos - 1] == ' ')
    {
        dst[--pos] = '\0';
    }
}

void UdsVagScanner::storeHex(char *dst, size_t dstSize, const uint8_t *data, uint16_t len)
{
    if (!dst || dstSize == 0)
    {
        return;
    }

    dst[0] = '\0';
    size_t pos = 0;
    for (uint16_t i = 0; i < len && pos + 3 < dstSize; i++)
    {
        int written = snprintf(dst + pos, dstSize - pos, (i == 0) ? "%02X" : ":%02X", (unsigned int)data[i]);
        if (written <= 0)
        {
            break;
        }
        pos += (size_t)written;
    }
}

void UdsVagScanner::decodeUdsDtc(uint32_t dtc, char out[10])
{
    static const char hex[] = "0123456789ABCDEF";
    out[0] = hex[(dtc >> 20) & 0x0F];
    out[1] = hex[(dtc >> 16) & 0x0F];
    out[2] = hex[(dtc >> 12) & 0x0F];
    out[3] = hex[(dtc >> 8) & 0x0F];
    out[4] = hex[(dtc >> 4) & 0x0F];
    out[5] = hex[dtc & 0x0F];
    out[6] = '\0';
    out[7] = '\0';
    out[8] = '\0';
    out[9] = '\0';
}
