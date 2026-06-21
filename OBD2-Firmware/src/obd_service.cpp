#include "obd_service.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "obd_read_only_guard.h"

namespace
{
constexpr uint8_t kSupportProbePids[] = {0x00, 0x20, 0x40, 0x60, 0x80, 0xA0, 0xC0};
constexpr uint8_t kMode09ProbePids[] = {0x00, 0x02, 0x04, 0x06, 0x08, 0x0A, 0x0B, 0x0C};
constexpr uint8_t kKeyPidList[] = {0x0C, 0x0D, 0x05, 0x11, 0x2F, 0x10, 0x0B, 0x0F, 0x42, 0x5C, 0x5E};

constexpr uint8_t kFallbackPids[] = {
    0x04, 0x05, 0x0B, 0x0C, 0x0D, 0x0F, 0x10, 0x11,
    0x1F, 0x2F, 0x31, 0x33, 0x42, 0x46, 0x5C, 0x5E,
};

constexpr uint32_t kKeyIntervalMs = 50;
constexpr uint32_t kBgIntervalMs = 350;
constexpr uint32_t kMode02IntervalMs = 25000;
constexpr uint32_t kMode03IntervalMs = 15000;
constexpr uint32_t kMode06IntervalMs = 10000;
constexpr uint32_t kMode07IntervalMs = 20000;
constexpr uint32_t kMode0AIntervalMs = 30000;
constexpr uint32_t kMode09IntervalMs = 3000;

constexpr uint32_t kMode01NoRespFallbackMs = 2000;
constexpr uint32_t kMode01RouteStreakMs = 1500;
constexpr uint32_t kMode01RouteLockMs = 60000;
constexpr uint32_t kMode01ReprobeIntervalMs = 60000;
constexpr uint32_t kMode01ReprobeWindowMs = 2000;

bool alwaysProbeMode09Pid(uint8_t pid)
{
    return pid == 0x02 || pid == 0x04 || pid == 0x06 || pid == 0x08 || pid == 0x0A || pid == 0x0B || pid == 0x0C;
}

constexpr uint8_t kCompactRpm = 0;
constexpr uint8_t kCompactSpeed = 1;
constexpr uint8_t kCompactCoolant = 2;
constexpr uint8_t kCompactThrottle = 3;
constexpr uint8_t kCompactFuelLevel = 4;
constexpr uint8_t kCompactEngineLoad = 5;
constexpr uint8_t kCompactMap = 6;
constexpr uint8_t kCompactMaf = 7;
constexpr uint8_t kCompactEcuVoltage = 8;
constexpr uint8_t kCompactIntakeAir = 9;
constexpr uint8_t kCompactSparkAdvance = 10;

struct Mode01PidMeta
{
    uint8_t pid;
    const char *name;
    const char *unit;
    const char *formula;
    const char *category;
    const char *notes;
};

constexpr Mode01PidMeta kMode01Meta[] = {
    {0x01, "monitor", "", "bitfield", "readiness", "MIL+DTC count"},
    {0x02, "freeze_dtc", "", "DTC word", "dtc", "freeze trigger"},
    {0x03, "fuel_sys", "", "bitfield", "fuel", "loop status"},
    {0x04, "engine_load", "pct", "A*100/255", "engine", "calculated"},
    {0x05, "coolant", "C", "A-40", "temp", "ECT"},
    {0x06, "stft_b1", "pct", "(A-128)*100/128", "fuel_trim", "bank1"},
    {0x07, "ltft_b1", "pct", "(A-128)*100/128", "fuel_trim", "bank1"},
    {0x08, "stft_b2", "pct", "(A-128)*100/128", "fuel_trim", "bank2"},
    {0x09, "ltft_b2", "pct", "(A-128)*100/128", "fuel_trim", "bank2"},
    {0x0A, "fuel_press", "kPa", "A*3", "fuel", "gauge"},
    {0x0B, "map", "kPa", "A", "air", "intake"},
    {0x0C, "rpm", "rpm", "((A*256)+B)/4", "engine", "key"},
    {0x0D, "speed", "km/h", "A", "vehicle", "key"},
    {0x0E, "spark_adv", "deg", "A/2-64", "ignition", "timing"},
    {0x0F, "intake_air", "C", "A-40", "temp", "IAT"},
    {0x10, "maf", "g/s", "((A*256)+B)/100", "air", "key"},
    {0x11, "throttle", "pct", "A*100/255", "throttle", "absolute"},
    {0x1C, "obd_std", "", "A", "protocol", "standard"},
    {0x1F, "runtime", "s", "A*256+B", "engine", "since start"},
    {0x21, "dist_mil", "km", "A*256+B", "dtc", "MIL on"},
    {0x22, "fuel_rail", "kPa", "0.079*(A*256+B)", "fuel", "rail"},
    {0x23, "fuel_rail_g", "kPa", "10*(A*256+B)", "fuel", "gauge"},
    {0x2C, "cmd_egr", "pct", "A*100/255", "emissions", "commanded"},
    {0x2D, "egr_error", "pct", "(A-128)*100/128", "emissions", "error"},
    {0x2E, "evap_purge", "pct", "A*100/255", "emissions", "purge"},
    {0x2F, "fuel_level", "pct", "A*100/255", "fuel", "tank"},
    {0x30, "warmups", "", "A", "dtc", "since clear"},
    {0x31, "dist_clear", "km", "A*256+B", "dtc", "since clear"},
    {0x32, "evap_press", "kPa", "((A*256)+B)/4", "emissions", "vapor"},
    {0x33, "baro", "kPa", "A", "air", "barometric"},
    {0x41, "monitor_dc", "", "bitfield", "readiness", "drive cycle"},
    {0x42, "ecu_v", "V", "((A*256)+B)/1000", "electrical", "module"},
    {0x43, "abs_load", "pct", "100*(A*256+B)/255", "engine", "absolute"},
    {0x44, "eq_ratio", "", "2*(A*256+B)/65536", "fuel", "lambda"},
    {0x46, "ambient", "C", "A-40", "temp", "ambient"},
    {0x4D, "time_mil", "min", "A*256+B", "dtc", "MIL on"},
    {0x4E, "time_clear", "min", "A*256+B", "dtc", "since clear"},
    {0x50, "maf_max", "g/s", "A*10", "air", "max"},
    {0x51, "fuel_type", "", "A", "fuel", "type"},
    {0x52, "ethanol", "pct", "A*100/255", "fuel", "ethanol"},
    {0x53, "evap_abs", "kPa", "((A*256)+B)/200", "emissions", "absolute"},
    {0x54, "evap_s", "Pa", "((A*256)+B-32768)/4", "emissions", "signed"},
    {0x59, "fuel_rail_a", "kPa", "10*(A*256+B)", "fuel", "absolute"},
    {0x5A, "pedal_rel", "pct", "A*100/255", "pedal", "relative"},
    {0x5B, "hybrid_batt", "pct", "A*100/255", "hybrid", "battery"},
    {0x5C, "oil_temp", "C", "A-40", "temp", "engine oil"},
    {0x5D, "inj_timing", "deg", "((A*256+B)/128)-210", "fuel", "diesel"},
    {0x5E, "fuel_rate", "L/h", "((A*256)+B)*0.05", "fuel", "rate"},
    {0x5F, "emis_req", "", "A", "emissions", "requirements"},
};

const Mode01PidMeta *findMode01Meta(uint8_t pid)
{
    for (const Mode01PidMeta &meta : kMode01Meta)
    {
        if (meta.pid == pid)
        {
            return &meta;
        }
    }
    return nullptr;
}

bool isSupportPidValue(uint8_t pid)
{
    return pid == 0x00 || (pid % 0x20) == 0;
}

const char *defaultCategoryForPid(uint8_t pid)
{
    if (isSupportPidValue(pid))
    {
        return "support";
    }
    if (pid >= 0x14 && pid <= 0x1B)
    {
        return "o2";
    }
    if ((pid >= 0x24 && pid <= 0x2B) || (pid >= 0x34 && pid <= 0x3B))
    {
        return "lambda";
    }
    if (pid >= 0x3C && pid <= 0x3F)
    {
        return "temp";
    }
    if ((pid >= 0x45 && pid <= 0x4C) || pid == 0x5A)
    {
        return "pedal";
    }
    if (pid >= 0x55 && pid <= 0x58)
    {
        return "fuel_trim";
    }
    return "unknown";
}

uint16_t be16(const uint8_t *d)
{
    return ((uint16_t)d[0] << 8) | d[1];
}

uint16_t pct10(uint8_t a)
{
    return (uint16_t)(((uint32_t)a * 1000UL) / 255UL);
}

int16_t trim10(uint8_t a)
{
    return (int16_t)(((int32_t)a - 128L) * 1000L / 128L);
}

void splitSigned10(int16_t value, char *out, size_t outSize)
{
    if (value < 0)
    {
        int16_t absV = (int16_t)(-value);
        snprintf(out, outSize, "-%u.%u", (unsigned int)(absV / 10), (unsigned int)(absV % 10));
    }
    else
    {
        snprintf(out, outSize, "%u.%u", (unsigned int)(value / 10), (unsigned int)(value % 10));
    }
}

void formatPct10Value(uint16_t value, char *out, size_t outSize)
{
    snprintf(out, outSize, "%u.%u", (unsigned int)(value / 10), (unsigned int)(value % 10));
}

void formatPctA(uint8_t value, char *out, size_t outSize)
{
    formatPct10Value(pct10(value), out, outSize);
}

int16_t tempA(uint8_t value)
{
    return (int16_t)value - 40;
}

void formatDataHex(const uint8_t *data, uint8_t len, char *out, size_t outSize)
{
    if (!out || outSize == 0)
    {
        return;
    }

    out[0] = '\0';
    size_t pos = 0;
    uint8_t safeLen = len > 8 ? 8 : len;
    for (uint8_t i = 0; i < safeLen; i++)
    {
        int written = snprintf(out + pos, outSize - pos, (i == 0) ? "%02X" : ":%02X", data[i]);
        if (written <= 0)
        {
            break;
        }

        size_t w = static_cast<size_t>(written);
        if (w >= (outSize - pos))
        {
            pos = outSize - 1;
            break;
        }
        pos += w;
    }
}

uint8_t boundedPayloadLen(uint8_t declaredLen, uint8_t availableLen)
{
    return declaredLen < availableLen ? declaredLen : availableLen;
}

void decodeDtcWord(uint8_t a, uint8_t b, char out[6])
{
    static const char kind[] = {'P', 'C', 'B', 'U'};
    out[0] = kind[(a >> 6) & 0x03];
    out[1] = char('0' + ((a >> 4) & 0x03));

    static const char hex[] = "0123456789ABCDEF";
    out[2] = hex[a & 0x0F];
    out[3] = hex[(b >> 4) & 0x0F];
    out[4] = hex[b & 0x0F];
    out[5] = '\0';
}

const char *fuelTypeName(uint8_t code)
{
    switch (code)
    {
    case 0:
        return "not_available";
    case 1:
        return "gasoline";
    case 2:
        return "methanol";
    case 3:
        return "ethanol";
    case 4:
        return "diesel";
    case 5:
        return "lpg";
    case 6:
        return "cng";
    case 7:
        return "propane";
    case 8:
        return "electric";
    case 17:
        return "hybrid_gasoline";
    case 18:
        return "hybrid_ethanol";
    case 19:
        return "hybrid_diesel";
    default:
        return "unknown";
    }
}

const char *fuelSystemStatusName(uint8_t code)
{
    switch (code)
    {
    case 0x00:
        return "na";
    case 0x01:
        return "ol_temp";
    case 0x02:
        return "cl";
    case 0x04:
        return "ol_load";
    case 0x08:
        return "ol_fault";
    case 0x10:
        return "cl_fault";
    default:
        return "unk";
    }
}

const char *secondaryAirName(uint8_t code)
{
    switch (code)
    {
    case 0x01:
        return "upstream";
    case 0x02:
        return "downstream";
    case 0x04:
        return "outside";
    case 0x08:
        return "pump_diag";
    case 0x10:
        return "atm_off";
    default:
        return "na";
    }
}

const char *obdStandardName(uint8_t code)
{
    switch (code)
    {
    case 0x01:
        return "obd2";
    case 0x02:
        return "obd";
    case 0x03:
        return "obd1";
    case 0x04:
        return "not_obd";
    case 0x05:
        return "eobd";
    case 0x06:
        return "eobd+obd2";
    case 0x07:
        return "eobd+obd";
    case 0x08:
        return "eobd+obd1";
    case 0x09:
        return "eobd+obd1+obd2";
    case 0x0A:
        return "jobd";
    case 0x0B:
        return "jobd+obd2";
    case 0x0C:
        return "jobd+eobd";
    case 0x0D:
        return "jobd+eobd+obd2";
    case 0x11:
        return "emd";
    case 0x12:
        return "emd+";
    case 0x13:
        return "hd_obd_c";
    case 0x14:
        return "hd_obd";
    case 0x15:
        return "wwh_obd";
    case 0x17:
        return "obd2b";
    case 0x1D:
        return "hd_eobd_i";
    case 0x1E:
        return "hd_eobd_ii";
    case 0x21:
        return "braz_obd1";
    case 0x22:
        return "braz_obd2";
    case 0x23:
        return "k_obd";
    case 0x24:
        return "i_obd_i";
    case 0x25:
        return "i_obd_ii";
    case 0x26:
        return "hd_eobd_s";
    default:
        return "unknown";
    }
}
} // namespace

void ObdService::begin()
{
    activeQuery_ = false;
    resetDiscovery();
}

void ObdService::setActiveQuery(bool enabled)
{
    if (activeQuery_ == enabled)
    {
        return;
    }

    activeQuery_ = enabled;
    if (activeQuery_)
    {
        resetDiscovery();
        rebuildQueryPlan();
    }
}

bool ObdService::activeQuery() const
{
    return activeQuery_;
}

void ObdService::setDiagnosticInfoEnabled(bool enabled)
{
    diagnosticInfoEnabled_ = enabled;
}

void ObdService::applyRuntimeProfile(const ObdRuntimeProfile &profile)
{
    runtimeProfile_ = profile;
    runtimeProfileActive_ = runtimeProfile_.signalCount > 0;
    resetDiscovery();
    rebuildQueryPlan();
}

const ObdRuntimeProfile &ObdService::runtimeProfile() const
{
    return runtimeProfile_;
}

bool ObdService::hasRuntimeProfile() const
{
    return runtimeProfileActive_;
}

uint32_t ObdService::responsesWindow() const
{
    return respWindow_;
}

uint32_t ObdService::decodedWindow() const
{
    return decodedWindow_;
}

uint16_t ObdService::queryPidCount() const
{
    return (uint16_t)keyQueryCount_ + (uint16_t)bgQueryCount_;
}

uint16_t ObdService::keyPidCount() const
{
    return keyQueryCount_;
}

uint16_t ObdService::bgPidCount() const
{
    return bgQueryCount_;
}

uint16_t ObdService::supportedPidCount() const
{
    return supportedCount_;
}

const char *ObdService::mode01RouteName() const
{
    return routeName(mode01Route_);
}

uint32_t ObdService::keyQueryPerSec() const
{
    return keyQueryWindow_;
}

uint32_t ObdService::bgQueryPerSec() const
{
    return bgQueryWindow_;
}

uint32_t ObdService::readGuardBlocked() const
{
    return readGuardBlocked_;
}

const ObdVehicleInfo &ObdService::vehicleInfo() const
{
    return vehicle_;
}

bool ObdService::collectCompactSample(uint32_t nowMs, uint32_t maxAgeMs, ObdCompactSample *out) const
{
    if (!out)
    {
        return false;
    }

    *out = compactSample_;
    out->validMask = 0;

    static const uint16_t kBits[] = {
        OBD_SAMPLE_RPM,
        OBD_SAMPLE_SPEED,
        OBD_SAMPLE_COOLANT,
        OBD_SAMPLE_THROTTLE,
        OBD_SAMPLE_FUEL_LEVEL,
        OBD_SAMPLE_ENGINE_LOAD,
        OBD_SAMPLE_MAP,
        OBD_SAMPLE_MAF,
        OBD_SAMPLE_ECU_VOLTAGE,
        OBD_SAMPLE_INTAKE_AIR,
        OBD_SAMPLE_SPARK_ADVANCE,
    };

    for (uint8_t i = 0; i < sizeof(kBits) / sizeof(kBits[0]); i++)
    {
        uint32_t updatedMs = compactLastUpdateMs_[i];
        if (updatedMs != 0 && (nowMs - updatedMs) <= maxAgeMs)
        {
            out->validMask |= kBits[i];
        }
    }

    return out->validMask != 0;
}

void ObdService::clearWindowCounters()
{
    txWindow_ = 0;
    respWindow_ = 0;
    decodedWindow_ = 0;
    keyQueryWindow_ = 0;
    bgQueryWindow_ = 0;
}

const char *ObdService::routeName(Mode01Route route)
{
    switch (route)
    {
    case Mode01Route::StdFunctional7DF:
        return "7DF";
    case Mode01Route::StdPhysical7E0:
        return "7E0";
    case Mode01Route::ExtFunctional29b:
        return "29b";
    default:
        return "unk";
    }
}

void ObdService::sendRequestFrame(uint32_t id, bool extended, uint8_t lenByte, uint8_t service, uint8_t pid)
{
    ObdGuardRequest guardRequest{};
    guardRequest.family = ObdCommandFamily::StandardObd;
    guardRequest.service = service;
    guardRequest.pidOrSubFunction = pid;
    guardRequest.canId = id;
    guardRequest.extended = extended;

    ObdGuardDecision decision = ObdReadOnlyGuard::check(guardRequest);
    if (!decision.allowed)
    {
        readGuardBlocked_++;
        Serial.printf("[readOnlyGuard] BLOCK service=0x%02X pid=0x%02X id=0x%lX ext=%u reason=%s\n",
                      (unsigned int)service,
                      (unsigned int)pid,
                      (unsigned long)id,
                      extended ? 1U : 0U,
                      decision.reason ? decision.reason : "blocked");
        return;
    }

    CAN_FRAME req;
    req.id = id;
    req.extended = extended ? 1 : 0;
    req.rtr = 0;
    req.length = 8;

    for (uint8_t i = 0; i < 8; i++)
    {
        req.data.byte[i] = 0;
    }

    req.data.byte[0] = lenByte;
    req.data.byte[1] = service;
    req.data.byte[2] = pid;

    CAN0.sendFrame(req);
    txWindow_++;
}

bool ObdService::sendIsoTpFlowControl(const CAN_FRAME &firstFrame)
{
    uint32_t flowControlId = 0;
    bool extended = firstFrame.extended != 0;

    if (!extended && firstFrame.id >= 0x7E8 && firstFrame.id <= 0x7EF)
    {
        flowControlId = firstFrame.id - 8;
    }
    else if (extended)
    {
        uint8_t source = (uint8_t)(firstFrame.id & 0xFF);
        flowControlId = 0x18DA0000UL | ((uint32_t)source << 8) | 0xF1UL;
    }
    else
    {
        return false;
    }

    ObdGuardRequest guardRequest{};
    guardRequest.family = ObdCommandFamily::IsoTpFlowControl;
    guardRequest.canId = flowControlId;
    guardRequest.extended = extended;
    ObdGuardDecision decision = ObdReadOnlyGuard::check(guardRequest);
    if (!decision.allowed)
    {
        isoTpFlowControlBlocked_++;
        readGuardBlocked_++;
        return false;
    }

    CAN_FRAME fc;
    fc.id = flowControlId;
    fc.extended = extended ? 1 : 0;
    fc.rtr = 0;
    fc.length = 8;
    memset(fc.data.byte, 0, sizeof(fc.data.byte));
    fc.data.byte[0] = 0x30; // Continue To Send, block size 0, STmin 0.

    if (!CAN0.sendFrame(fc))
    {
        return false;
    }
    txWindow_++;
    return true;
}

void ObdService::sendMode01Request(uint8_t pid, uint32_t nowMs)
{
    switch (mode01Route_)
    {
    case Mode01Route::StdFunctional7DF:
        sendRequestFrame(0x7DF, false, 0x02, 0x01, pid);
        break;
    case Mode01Route::StdPhysical7E0:
        sendRequestFrame(0x7E0, false, 0x02, 0x01, pid);
        break;
    case Mode01Route::ExtFunctional29b:
        sendRequestFrame(0x18DB33F1, true, 0x02, 0x01, pid);
        break;
    default:
        sendRequestFrame(0x7DF, false, 0x02, 0x01, pid);
        break;
    }

    markMode01Request(pid, nowMs);
}

void ObdService::sendMode02Request(uint8_t pid)
{
    sendRequestFrame(0x7DF, false, 0x02, 0x02, pid);
    sendRequestFrame(0x7E0, false, 0x02, 0x02, pid);
    sendRequestFrame(0x18DB33F1, true, 0x02, 0x02, pid);
}

void ObdService::markMode01Request(uint8_t pid, uint32_t nowMs)
{
    if (pid > kMaxPid)
    {
        return;
    }
    ObdPidHealth &health = pidHealth_[pid];
    if (health.lastReqMs != 0 && health.lastRspMs < health.lastReqMs && health.missCount < 0xFFFF)
    {
        health.missCount++;
    }
    health.lastReqMs = nowMs;
    health.active = true;
}

void ObdService::markMode01Response(uint8_t pid, uint32_t nowMs)
{
    if (pid > kMaxPid)
    {
        return;
    }
    ObdPidHealth &health = pidHealth_[pid];
    health.lastRspMs = nowMs;
    health.active = true;
    if (health.missCount > 0)
    {
        health.missCount--;
    }

    mode01LastResponseMs_ = nowMs;
    mode01BootstrapActive_ = false;
    if (mode01ResponseStreakStartMs_ == 0)
    {
        mode01ResponseStreakStartMs_ = nowMs;
    }

    if (nowMs >= mode01ResponseStreakStartMs_ &&
        (nowMs - mode01ResponseStreakStartMs_) >= kMode01RouteStreakMs)
    {
        mode01RouteLockUntilMs_ = nowMs + kMode01RouteLockMs;
    }
}

void ObdService::switchMode01Route(Mode01Route route, uint32_t nowMs)
{
    if (mode01Route_ == route)
    {
        return;
    }
    mode01Route_ = route;
    mode01RouteSinceMs_ = nowMs;
    mode01ResponseStreakStartMs_ = 0;
}

void ObdService::manageMode01Route(uint32_t nowMs)
{
    bool locked = (mode01RouteLockUntilMs_ > nowMs);
    if (!locked && !mode01ReprobeActive_ &&
        mode01Route_ != Mode01Route::StdFunctional7DF &&
        (nowMs - mode01LastProbeMs_) >= kMode01ReprobeIntervalMs)
    {
        mode01ReprobeActive_ = true;
        mode01ReprobeUntilMs_ = nowMs + kMode01ReprobeWindowMs;
        mode01ReprobeReturnRoute_ = mode01Route_;
        switchMode01Route(Mode01Route::StdFunctional7DF, nowMs);
    }

    if (mode01ReprobeActive_)
    {
        if (mode01Route_ == Mode01Route::StdFunctional7DF &&
            mode01LastResponseMs_ >= mode01RouteSinceMs_)
        {
            mode01ReprobeActive_ = false;
            mode01LastProbeMs_ = nowMs;
            mode01RouteLockUntilMs_ = nowMs + kMode01RouteLockMs;
            return;
        }

        if (nowMs >= mode01ReprobeUntilMs_)
        {
            switchMode01Route(mode01ReprobeReturnRoute_, nowMs);
            mode01ReprobeActive_ = false;
            mode01LastProbeMs_ = nowMs;
        }
        return;
    }

    if (locked)
    {
        return;
    }

    if (mode01LastResponseMs_ != 0 &&
        nowMs > mode01LastResponseMs_ &&
        (nowMs - mode01LastResponseMs_) >= kMode01NoRespFallbackMs)
    {
        mode01ResponseStreakStartMs_ = 0;
    }

    if ((nowMs - mode01RouteSinceMs_) < kMode01NoRespFallbackMs)
    {
        return;
    }

    bool hasRecentResponse = (mode01LastResponseMs_ != 0) &&
                             ((nowMs - mode01LastResponseMs_) < kMode01NoRespFallbackMs);
    if (hasRecentResponse)
    {
        return;
    }

    if (mode01Route_ == Mode01Route::StdFunctional7DF)
    {
        switchMode01Route(Mode01Route::StdPhysical7E0, nowMs);
    }
    else if (mode01Route_ == Mode01Route::StdPhysical7E0)
    {
        switchMode01Route(Mode01Route::ExtFunctional29b, nowMs);
    }
    else
    {
        // Keep probing all route options instead of sticking on 29-bit forever.
        switchMode01Route(Mode01Route::StdFunctional7DF, nowMs);
    }
}

void ObdService::sendMode03Request()
{
    sendRequestFrame(0x7DF, false, 0x01, 0x03, 0x00);
    sendRequestFrame(0x7E0, false, 0x01, 0x03, 0x00);
    sendRequestFrame(0x18DB33F1, true, 0x01, 0x03, 0x00);
}

void ObdService::sendMode06Request(uint8_t tid)
{
    sendRequestFrame(0x7DF, false, 0x02, 0x06, tid);
    sendRequestFrame(0x7E0, false, 0x02, 0x06, tid);
    sendRequestFrame(0x18DB33F1, true, 0x02, 0x06, tid);
}

void ObdService::sendMode07Request()
{
    sendRequestFrame(0x7DF, false, 0x01, 0x07, 0x00);
    sendRequestFrame(0x7E0, false, 0x01, 0x07, 0x00);
    sendRequestFrame(0x18DB33F1, true, 0x01, 0x07, 0x00);
}

void ObdService::sendMode0ARequest()
{
    sendRequestFrame(0x7DF, false, 0x01, 0x0A, 0x00);
    sendRequestFrame(0x7E0, false, 0x01, 0x0A, 0x00);
    sendRequestFrame(0x18DB33F1, true, 0x01, 0x0A, 0x00);
}

void ObdService::sendMode09Request(uint8_t pid)
{
    sendRequestFrame(0x7DF, false, 0x02, 0x09, pid);
    sendRequestFrame(0x7E0, false, 0x02, 0x09, pid);
    sendRequestFrame(0x18DB33F1, true, 0x02, 0x09, pid);
}

void ObdService::tick(uint32_t nowMs, bool canReady)
{
    if (!activeQuery_ || !canReady)
    {
        return;
    }

    manageMode01Route(nowMs);

    if (!discoveryComplete_)
    {
        if (nowMs - lastSupportMs_ >= 350)
        {
            sendMode01Request(kSupportProbePids[supportCursor_], nowMs);
            supportCursor_++;
            if (supportCursor_ >= (sizeof(kSupportProbePids) / sizeof(kSupportProbePids[0])))
            {
                supportCursor_ = 0;
                discoveryComplete_ = true;
                lastDiscoveryRefreshMs_ = nowMs;
                mode09SupportKnown_ = false;
                sendMode09Request(0x00);
            }
            lastSupportMs_ = nowMs;
        }
        return;
    }

    if (nowMs - lastDiscoveryRefreshMs_ >= 30000)
    {
        discoveryComplete_ = false;
        supportCursor_ = 0;
        memset(supportAnswered_, 0, sizeof(supportAnswered_));
        return;
    }

    if (scheduleKeyLane(nowMs))
    {
        return;
    }

    if (scheduleBgLane(nowMs))
    {
        return;
    }

    if (diagnosticInfoEnabled_ && nowMs - scheduler_.lastMode02Ms >= kMode02IntervalMs)
    {
        sendMode02Request(0x02);
        scheduler_.lastMode02Ms = nowMs;
        return;
    }

    if (diagnosticInfoEnabled_ && nowMs - scheduler_.lastMode03Ms >= kMode03IntervalMs)
    {
        sendMode03Request();
        scheduler_.lastMode03Ms = nowMs;
        return;
    }

    if (diagnosticInfoEnabled_ && nowMs - scheduler_.lastMode06Ms >= kMode06IntervalMs)
    {
        sendMode06Request(nextMode06Tid());
        scheduler_.lastMode06Ms = nowMs;
        return;
    }

    if (diagnosticInfoEnabled_ && nowMs - scheduler_.lastMode07Ms >= kMode07IntervalMs)
    {
        sendMode07Request();
        scheduler_.lastMode07Ms = nowMs;
        return;
    }

    if (diagnosticInfoEnabled_ && nowMs - scheduler_.lastMode0AMs >= kMode0AIntervalMs)
    {
        sendMode0ARequest();
        scheduler_.lastMode0AMs = nowMs;
        return;
    }

    if (nowMs - scheduler_.lastMode09Ms < kMode09IntervalMs)
    {
        return;
    }

    uint8_t pid = kMode09ProbePids[mode09Cursor_];
    mode09Cursor_ = (uint8_t)((mode09Cursor_ + 1) % (sizeof(kMode09ProbePids) / sizeof(kMode09ProbePids[0])));
    if (pid == 0x00 || alwaysProbeMode09Pid(pid) || !mode09SupportKnown_ || pidBit(mode09Supported_, pid))
    {
        sendMode09Request(pid);
    }
    scheduler_.lastMode09Ms = nowMs;
}

bool ObdService::scheduleKeyLane(uint32_t nowMs)
{
    if (keyQueryCount_ == 0)
    {
        return false;
    }
    if ((nowMs - scheduler_.lastKeyMs) < kKeyIntervalMs)
    {
        return false;
    }

    uint8_t pid = keyQueryPids_[keyQueryCursor_];
    keyQueryCursor_ = (uint8_t)((keyQueryCursor_ + 1) % keyQueryCount_);
    sendMode01Request(pid, nowMs);
    keyQueryWindow_++;
    scheduler_.lastKeyMs = nowMs;
    return true;
}

bool ObdService::shouldSkipBgPid(uint8_t pid, uint32_t nowMs) const
{
    if (pid > kMaxPid)
    {
        return false;
    }
    const ObdPidHealth &health = pidHealth_[pid];
    if (health.missCount <= 25)
    {
        return false;
    }

    uint8_t slot = (uint8_t)((nowMs / kBgIntervalMs) % 3);
    return (uint8_t)(pid % 3) != slot;
}

bool ObdService::scheduleBgLane(uint32_t nowMs)
{
    if (bgQueryCount_ == 0)
    {
        return false;
    }
    if ((nowMs - scheduler_.lastBgMs) < kBgIntervalMs)
    {
        return false;
    }

    uint8_t attempts = bgQueryCount_;
    while (attempts-- > 0)
    {
        uint8_t pid = bgQueryPids_[bgQueryCursor_];
        bgQueryCursor_ = (uint8_t)((bgQueryCursor_ + 1) % bgQueryCount_);
        if (shouldSkipBgPid(pid, nowMs))
        {
            continue;
        }

        sendMode01Request(pid, nowMs);
        bgQueryWindow_++;
        scheduler_.lastBgMs = nowMs;
        return true;
    }

    scheduler_.lastBgMs = nowMs;
    return false;
}

bool ObdService::isObdResponseFrame(const CAN_FRAME &frame)
{
    if (frame.rtr || frame.length < 2)
    {
        return false;
    }

    bool isStdResp = (!frame.extended && frame.id >= 0x7E8 && frame.id <= 0x7EF);
    bool isExtResp = (frame.extended && ((frame.id & 0x1FFFFF00UL) == 0x18DAF100UL));
    return isStdResp || isExtResp;
}

bool ObdService::isMode01Response(const CAN_FRAME &frame)
{
    return isObdResponseFrame(frame) && frame.length >= 3 && frame.data.byte[1] == 0x41;
}

bool ObdService::isMode02Response(const CAN_FRAME &frame)
{
    return isObdResponseFrame(frame) && frame.length >= 3 && frame.data.byte[1] == 0x42;
}

bool ObdService::isMode03Response(const CAN_FRAME &frame)
{
    return isObdResponseFrame(frame) && frame.length >= 2 && frame.data.byte[1] == 0x43;
}

bool ObdService::isMode06Response(const CAN_FRAME &frame)
{
    return isObdResponseFrame(frame) && frame.length >= 3 && frame.data.byte[1] == 0x46;
}

bool ObdService::isMode07Response(const CAN_FRAME &frame)
{
    return isObdResponseFrame(frame) && frame.length >= 2 && frame.data.byte[1] == 0x47;
}

bool ObdService::isMode0AResponse(const CAN_FRAME &frame)
{
    return isObdResponseFrame(frame) && frame.length >= 2 && frame.data.byte[1] == 0x4A;
}

bool ObdService::isMode09Response(const CAN_FRAME &frame)
{
    return isObdResponseFrame(frame) && frame.length >= 3 && frame.data.byte[1] == 0x49;
}

bool ObdService::isSupportBitmapPid(uint8_t pid)
{
    return isSupportPidValue(pid);
}

bool ObdService::pidBit(const uint32_t *bits, uint8_t pid)
{
    return bits && (bits[pid >> 5] & (1UL << (pid & 31U)));
}

bool ObdService::setPidBit(uint32_t *bits, uint8_t pid)
{
    if (!bits)
    {
        return false;
    }
    uint32_t mask = 1UL << (pid & 31U);
    uint32_t &word = bits[pid >> 5];
    bool changed = (word & mask) == 0;
    word |= mask;
    return changed;
}

uint8_t ObdService::singleFramePayloadLen(const CAN_FRAME &frame)
{
    if (frame.length < 2 || (frame.data.byte[0] & 0xF0) != 0x00)
    {
        return 0;
    }

    uint8_t declaredLen = frame.data.byte[0] & 0x0F;
    uint8_t availableLen = frame.length - 1;
    return boundedPayloadLen(declaredLen, availableLen);
}

void ObdService::resetDiscovery()
{
    discoveryComplete_ = false;
    supportCursor_ = 0;
    keyQueryCursor_ = 0;
    keyQueryCount_ = 0;
    bgQueryCursor_ = 0;
    bgQueryCount_ = 0;

    memset(supportAnswered_, 0, sizeof(supportAnswered_));
    memset(supported_, 0, sizeof(supported_));
    memset(rawSeen_, 0, sizeof(rawSeen_));
    memset(mode09Supported_, 0, sizeof(mode09Supported_));
    memset(mode06Supported_, 0, sizeof(mode06Supported_));
    memset(pidHealth_, 0, sizeof(pidHealth_));

    memset(metrics_, 0, sizeof(metrics_));
    memset(&vehicle_, 0, sizeof(vehicle_));
    snprintf(vehicle_.profile,
             sizeof(vehicle_.profile),
             "%s",
             runtimeProfileActive_ ? runtimeProfile_.profileId : "generic_obd2");
    memset(&compactSample_, 0, sizeof(compactSample_));
    memset(compactLastUpdateMs_, 0, sizeof(compactLastUpdateMs_));

    memset(vinChunkLen_, 0, sizeof(vinChunkLen_));
    memset(vinChunks_, 0, sizeof(vinChunks_));
    memset(calidChunkLen_, 0, sizeof(calidChunkLen_));
    memset(calidChunks_, 0, sizeof(calidChunks_));
    memset(cvnChunkLen_, 0, sizeof(cvnChunkLen_));
    memset(cvnChunks_, 0, sizeof(cvnChunks_));
    memset(mode09Chunks_, 0, sizeof(mode09Chunks_));

    mode09SupportKnown_ = false;
    mode09Cursor_ = 0;
    mode06SupportCursor_ = 0;
    mode06TidCursor_ = 1;
    mode06DiscoveryComplete_ = false;

    lastSupportMs_ = 0;
    lastDiscoveryRefreshMs_ = millis();
    scheduler_ = {};

    txWindow_ = 0;
    respWindow_ = 0;
    decodedWindow_ = 0;
    totalResponses_ = 0;
    keyQueryWindow_ = 0;
    bgQueryWindow_ = 0;
    readGuardBlocked_ = 0;
    isoTpFlowControlBlocked_ = 0;
    supportedCount_ = 0;
    isoTpRx_ = {};

    mode01Route_ = Mode01Route::StdFunctional7DF;
    mode01ReprobeReturnRoute_ = Mode01Route::StdFunctional7DF;
    mode01RouteSinceMs_ = lastDiscoveryRefreshMs_;
    mode01LastResponseMs_ = 0;
    mode01ResponseStreakStartMs_ = 0;
    mode01RouteLockUntilMs_ = 0;
    mode01LastProbeMs_ = lastDiscoveryRefreshMs_;
    mode01ReprobeUntilMs_ = 0;
    mode01ReprobeActive_ = false;
    mode01BootstrapActive_ = false;
}

bool ObdService::addKeyPid(uint8_t pid)
{
    if (keyQueryCount_ >= kMaxKeyPids)
    {
        return false;
    }

    for (uint8_t i = 0; i < keyQueryCount_; i++)
    {
        if (keyQueryPids_[i] == pid)
        {
            return true;
        }
    }

    keyQueryPids_[keyQueryCount_++] = pid;
    return true;
}

bool ObdService::addBgPid(uint8_t pid)
{
    if (bgQueryCount_ >= kMaxQueryPids)
    {
        return false;
    }

    for (uint8_t i = 0; i < bgQueryCount_; i++)
    {
        if (bgQueryPids_[i] == pid)
        {
            return true;
        }
    }

    bgQueryPids_[bgQueryCount_++] = pid;
    return true;
}

bool ObdService::isKeyPid(uint8_t pid) const
{
    for (uint8_t keyPid : kKeyPidList)
    {
        if (pid == keyPid)
        {
            return true;
        }
    }
    return false;
}

bool ObdService::addRuntimeProfilePids(bool supportedOnly)
{
    bool added = false;
    for (uint8_t i = 0; i < runtimeProfile_.signalCount; i++)
    {
        const ObdProfileSignalConfig &signal = runtimeProfile_.signals[i];
        if (!signal.enabled || signal.pid == 0 || signal.pid > kMaxPid)
        {
            continue;
        }
        if (supportedOnly && !pidBit(supported_, signal.pid))
        {
            continue;
        }

        pidHealth_[signal.pid].active = true;
        if (signal.required || signal.pollMs <= 1000)
        {
            added = addKeyPid(signal.pid) || added;
        }
        else
        {
            added = addBgPid(signal.pid) || added;
        }
    }
    return added;
}

void ObdService::rebuildQueryPlan()
{
    keyQueryCount_ = 0;
    keyQueryCursor_ = 0;
    bgQueryCount_ = 0;
    bgQueryCursor_ = 0;

    if (runtimeProfileActive_)
    {
        if (addRuntimeProfilePids(true))
        {
            return;
        }

        addRuntimeProfilePids(false);
        return;
    }

    bool anySupported = false;
    for (uint16_t pid = 1; pid <= kMaxPid; pid++)
    {
        if (!pidBit(supported_, (uint8_t)pid))
        {
            continue;
        }
        if (isSupportBitmapPid((uint8_t)pid))
        {
            continue;
        }

        anySupported = true;
        pidHealth_[pid].active = true;
        if (isKeyPid((uint8_t)pid))
        {
            addKeyPid((uint8_t)pid);
            continue;
        }
        if (!addBgPid((uint8_t)pid))
        {
            break;
        }
    }

    if (anySupported)
    {
        return;
    }

    for (uint8_t keyPid : kKeyPidList)
    {
        addKeyPid(keyPid);
    }

    for (uint8_t pid : kFallbackPids)
    {
        if (isKeyPid(pid))
        {
            continue;
        }
        if (!addBgPid(pid))
        {
            break;
        }
    }
}

void ObdService::handleSupportedBitmap(uint8_t pid, const uint8_t *data, uint8_t dataLen, uint32_t nowMs)
{
    if (dataLen < 4)
    {
        return;
    }

    uint32_t bits = ((uint32_t)data[0] << 24) |
                    ((uint32_t)data[1] << 16) |
                    ((uint32_t)data[2] << 8) |
                    ((uint32_t)data[3]);

    uint8_t base = pid;
    for (uint8_t i = 0; i < 32; i++)
    {
        if ((bits & (1UL << (31 - i))) == 0)
        {
            continue;
        }

        uint16_t discovered = (uint16_t)base + 1 + i;
        if (discovered >= 256)
        {
            continue;
        }

        if (discovered > kMaxPid)
        {
            continue;
        }

        if (setPidBit(supported_, (uint8_t)discovered))
        {
            supportedCount_++;
        }
    }

    for (uint8_t i = 0; i < (sizeof(kSupportProbePids) / sizeof(kSupportProbePids[0])); i++)
    {
        if (kSupportProbePids[i] == pid)
        {
            supportAnswered_[i] = true;
            break;
        }
    }

    rebuildQueryPlan();

    char key[20];
    snprintf(key, sizeof(key), "support_%02X", (unsigned int)pid);
    setMetricText(pid, key, metrics_[pid].raw, "", true, false, false, nowMs);
}

void ObdService::setMetricText(uint8_t pid,
                               const char *key,
                               const char *value,
                               const char *unit,
                               bool decoded,
                               bool warn,
                               bool error,
                               uint32_t nowMs)
{
    if (pid > kMaxPid)
    {
        return;
    }
    ObdMetric &m = metrics_[pid];
    const Mode01PidMeta *meta = findMode01Meta(pid);

    bool valueChanged = (strncmp(m.value, value, sizeof(m.value)) != 0) ||
                        (strncmp(m.unit, unit, sizeof(m.unit)) != 0);

    m.mode = 0x01;
    m.pid = pid;
    m.supported = pidBit(supported_, pid);
    m.decoded = decoded;
    m.warn = warn;
    m.error = error;

    snprintf(m.key, sizeof(m.key), "%s", key ? key : (meta ? meta->name : ""));
    snprintf(m.value, sizeof(m.value), "%s", value ? value : "");
    snprintf(m.unit, sizeof(m.unit), "%s", unit ? unit : (meta ? meta->unit : ""));
    snprintf(m.formula, sizeof(m.formula), "%s", meta ? meta->formula : "");
    snprintf(m.category, sizeof(m.category), "%s", meta ? meta->category : defaultCategoryForPid(pid));
    snprintf(m.notes, sizeof(m.notes), "%s", meta ? meta->notes : (pidBit(supported_, pid) ? "supported" : "observed"));

    m.lastUpdateMs = nowMs;
    if (m.lastChangeMs == 0 || valueChanged)
    {
        m.lastChangeMs = nowMs;
    }
}

void ObdService::setRawMetric(uint8_t pid, const uint8_t *data, uint8_t dataLen, uint32_t nowMs)
{
    if (pid > kMaxPid)
    {
        return;
    }
    char rawHex[24];
    formatDataHex(data, dataLen, rawHex, sizeof(rawHex));

    char key[20];
    snprintf(key, sizeof(key), "pid_%02X_raw", (unsigned int)pid);
    setMetricText(pid, key, rawHex, "", false, false, false, nowMs);
}

void ObdService::recordMetricRaw(uint8_t pid, const uint8_t *data, uint8_t dataLen, uint32_t nowMs)
{
    if (pid > kMaxPid)
    {
        return;
    }
    ObdMetric &m = metrics_[pid];
    uint32_t prevUpdateMs = m.lastUpdateMs;
    if (m.firstUpdateMs == 0)
    {
        m.firstUpdateMs = nowMs;
    }
    if (prevUpdateMs != 0 && nowMs > prevUpdateMs)
    {
        uint32_t delta = nowMs - prevUpdateMs;
        if (m.avgIntervalMs == 0)
        {
            m.avgIntervalMs = delta;
        }
        else
        {
            m.avgIntervalMs = (m.avgIntervalMs * 7UL + delta) / 8UL;
        }
    }
    if (m.updateCount < 0xFFFFFFFFUL)
    {
        m.updateCount++;
    }
    formatDataHex(data, dataLen, m.raw, sizeof(m.raw));
}

void ObdService::markCompactField(uint8_t fieldIndex, uint32_t nowMs)
{
    if (fieldIndex >= (sizeof(compactLastUpdateMs_) / sizeof(compactLastUpdateMs_[0])))
    {
        return;
    }

    compactLastUpdateMs_[fieldIndex] = nowMs;
}

bool ObdService::decodeMode01Pid(uint8_t pid, const uint8_t *data, uint8_t dataLen, uint32_t nowMs)
{
    char val[24];
    char key[20];
    bool warn = false;
    bool err = false;

    switch (pid)
    {
    case 0x01:
        if (dataLen < 4)
            return false;
        snprintf(val, sizeof(val), "%s dtc:%u",
                 (data[0] & 0x80) ? "mil:on" : "mil:off",
                 (unsigned int)(data[0] & 0x7F));
        setMetricText(pid, "monitor", val, "", true, false, false, nowMs);
        return true;

    case 0x02:
        if (dataLen < 2)
            return false;
        if (data[0] == 0 && data[1] == 0)
        {
            setMetricText(pid, "freeze_dtc", "none", "", true, false, false, nowMs);
        }
        else
        {
            char dtc[6];
            decodeDtcWord(data[0], data[1], dtc);
            setMetricText(pid, "freeze_dtc", dtc, "", true, false, false, nowMs);
        }
        return true;

    case 0x03:
        if (dataLen < 2)
            return false;
        snprintf(val, sizeof(val), "%s|%s",
                 fuelSystemStatusName(data[0]),
                 fuelSystemStatusName(data[1]));
        setMetricText(pid, "fuel_sys", val, "", true, false, false, nowMs);
        return true;

    case 0x04:
        if (dataLen < 1)
            return false;
        {
            uint16_t load10 = pct10(data[0]);
            compactSample_.engineLoadPct = (uint8_t)((load10 + 5U) / 10U);
            markCompactField(kCompactEngineLoad, nowMs);
            formatPct10Value(load10, val, sizeof(val));
        }
        setMetricText(pid, "engine_load", val, "pct", true, false, false, nowMs);
        return true;

    case 0x05:
        if (dataLen < 1)
            return false;
        {
            int16_t c = tempA(data[0]);
            compactSample_.coolantC = c;
            markCompactField(kCompactCoolant, nowMs);
            snprintf(val, sizeof(val), "%d", (int)c);
            warn = (c >= 100);
            err = (c >= 110);
            setMetricText(pid, "coolant", val, "C", true, warn, err, nowMs);
        }
        return true;

    case 0x06:
    case 0x07:
    case 0x08:
    case 0x09:
        if (dataLen < 1)
            return false;
        {
            static const char *kNames[] = {"stft_b1", "ltft_b1", "stft_b2", "ltft_b2"};
            int16_t t = trim10(data[0]);
            splitSigned10(t, val, sizeof(val));
            setMetricText(pid, kNames[pid - 0x06], val, "pct", true, false, false, nowMs);
        }
        return true;

    case 0x0A:
        if (dataLen < 1)
            return false;
        snprintf(val, sizeof(val), "%u", (unsigned int)((uint16_t)data[0] * 3U));
        setMetricText(pid, "fuel_press", val, "kPa", true, false, false, nowMs);
        return true;

    case 0x0B:
        if (dataLen < 1)
            return false;
        compactSample_.mapKpa = data[0];
        markCompactField(kCompactMap, nowMs);
        snprintf(val, sizeof(val), "%u", (unsigned int)data[0]);
        setMetricText(pid, "map", val, "kPa", true, false, false, nowMs);
        return true;

    case 0x0C:
        if (dataLen < 2)
            return false;
        {
            uint16_t rpm10 = (uint16_t)((be16(data) * 10UL) / 4UL);
            compactSample_.rpm = (uint16_t)((rpm10 + 5U) / 10U);
            markCompactField(kCompactRpm, nowMs);
            snprintf(val, sizeof(val), "%u.%u", (unsigned int)(rpm10 / 10), (unsigned int)(rpm10 % 10));
            warn = (rpm10 >= 45000);
            err = (rpm10 >= 60000);
            setMetricText(pid, "rpm", val, "", true, warn, err, nowMs);
        }
        return true;

    case 0x0D:
        if (dataLen < 1)
            return false;
        compactSample_.speedKph = data[0];
        markCompactField(kCompactSpeed, nowMs);
        snprintf(val, sizeof(val), "%u", (unsigned int)data[0]);
        setMetricText(pid, "speed", val, "km/h", true, false, false, nowMs);
        return true;

    case 0x0E:
        if (dataLen < 1)
            return false;
        {
            int16_t deg10 = (int16_t)data[0] * 5 - 640;
            compactSample_.sparkAdvanceDeg10 = deg10;
            markCompactField(kCompactSparkAdvance, nowMs);
            splitSigned10(deg10, val, sizeof(val));
            setMetricText(pid, "spark_adv", val, "deg", true, false, false, nowMs);
        }
        return true;

    case 0x0F:
        if (dataLen < 1)
            return false;
        {
            int16_t c = tempA(data[0]);
            compactSample_.intakeAirC = c;
            markCompactField(kCompactIntakeAir, nowMs);
            snprintf(val, sizeof(val), "%d", (int)c);
            setMetricText(pid, "intake_air", val, "C", true, false, false, nowMs);
        }
        return true;

    case 0x10:
        if (dataLen < 2)
            return false;
        {
            uint16_t maf100 = be16(data);
            compactSample_.mafCentiGps = maf100;
            markCompactField(kCompactMaf, nowMs);
            snprintf(val, sizeof(val), "%u.%02u", (unsigned int)(maf100 / 100), (unsigned int)(maf100 % 100));
            setMetricText(pid, "maf", val, "g/s", true, false, false, nowMs);
        }
        return true;

    case 0x11:
        if (dataLen < 1)
            return false;
        {
            uint16_t throttle10 = pct10(data[0]);
            compactSample_.throttlePct = (uint8_t)((throttle10 + 5U) / 10U);
            markCompactField(kCompactThrottle, nowMs);
            formatPct10Value(throttle10, val, sizeof(val));
        }
        setMetricText(pid, "throttle", val, "pct", true, false, false, nowMs);
        return true;

    case 0x12:
        if (dataLen < 1)
            return false;
        snprintf(val, sizeof(val), "%s", secondaryAirName(data[0]));
        setMetricText(pid, "sec_air", val, "", true, false, false, nowMs);
        return true;

    case 0x13:
        if (dataLen < 1)
            return false;
        snprintf(val, sizeof(val), "0x%02X", (unsigned int)data[0]);
        setMetricText(pid, "o2_present", val, "", true, false, false, nowMs);
        return true;

    case 0x14:
    case 0x15:
    case 0x16:
    case 0x17:
    case 0x18:
    case 0x19:
    case 0x1A:
    case 0x1B:
        if (dataLen < 2)
            return false;
        {
            uint16_t mv = (uint16_t)data[0] * 5U;
            int16_t t = trim10(data[1]);
            char stft[16];
            splitSigned10(t, stft, sizeof(stft));
            snprintf(val, sizeof(val), "%u.%03u|%s", (unsigned int)(mv / 1000), (unsigned int)(mv % 1000), stft);
            snprintf(key, sizeof(key), "o2_%02X", (unsigned int)pid);
            setMetricText(pid, key, val, "V|pct", true, false, false, nowMs);
        }
        return true;

    case 0x1F:
        if (dataLen < 2)
            return false;
        snprintf(val, sizeof(val), "%u", (unsigned int)be16(data));
        setMetricText(pid, "runtime", val, "s", true, false, false, nowMs);
        return true;

    case 0x1C:
        if (dataLen < 1)
            return false;
        snprintf(val, sizeof(val), "%u:%s", (unsigned int)data[0], obdStandardName(data[0]));
        setMetricText(pid, "obd_std", val, "", true, false, false, nowMs);
        return true;

    case 0x1D:
        if (dataLen < 1)
            return false;
        snprintf(val, sizeof(val), "0x%02X", (unsigned int)data[0]);
        setMetricText(pid, "o2_present2", val, "", true, false, false, nowMs);
        return true;

    case 0x1E:
        if (dataLen < 1)
            return false;
        snprintf(val, sizeof(val), "ac:%u pto:%u",
                 (unsigned int)((data[0] >> 1) & 0x01),
                 (unsigned int)(data[0] & 0x01));
        setMetricText(pid, "aux_input", val, "", true, false, false, nowMs);
        return true;

    case 0x21:
        if (dataLen < 2)
            return false;
        snprintf(val, sizeof(val), "%u", (unsigned int)be16(data));
        setMetricText(pid, "dist_mil", val, "km", true, false, false, nowMs);
        return true;

    case 0x22:
        if (dataLen < 2)
            return false;
        {
            uint32_t kpa10 = ((uint32_t)be16(data) * 79UL) / 100UL;
            snprintf(val, sizeof(val), "%lu.%lu", (unsigned long)(kpa10 / 10), (unsigned long)(kpa10 % 10));
            setMetricText(pid, "fuel_rail", val, "kPa", true, false, false, nowMs);
        }
        return true;

    case 0x23:
        if (dataLen < 2)
            return false;
        snprintf(val, sizeof(val), "%lu", (unsigned long)((uint32_t)be16(data) * 10UL));
        setMetricText(pid, "fuel_rail_g", val, "kPa", true, false, false, nowMs);
        return true;

    case 0x24:
    case 0x25:
    case 0x26:
    case 0x27:
    case 0x28:
    case 0x29:
    case 0x2A:
    case 0x2B:
        if (dataLen < 4)
            return false;
        {
            uint32_t lambda1000 = ((uint32_t)be16(data) * 1000UL) / 32768UL;
            uint32_t sec1000 = ((uint32_t)be16(data + 2) * 1000UL) / 8192UL;
            snprintf(val, sizeof(val), "%lu.%03lu|%lu.%03lu",
                     (unsigned long)(lambda1000 / 1000),
                     (unsigned long)(lambda1000 % 1000),
                     (unsigned long)(sec1000 / 1000),
                     (unsigned long)(sec1000 % 1000));
            snprintf(key, sizeof(key), "lambda_%02X", (unsigned int)pid);
            setMetricText(pid, key, val, "L|S", true, false, false, nowMs);
        }
        return true;

    case 0x2F:
        if (dataLen < 1)
            return false;
        {
            uint16_t fuel10 = pct10(data[0]);
            compactSample_.fuelLevelPct = (uint8_t)((fuel10 + 5U) / 10U);
            markCompactField(kCompactFuelLevel, nowMs);
            formatPct10Value(fuel10, val, sizeof(val));
        }
        setMetricText(pid, "fuel_level", val, "pct", true, false, false, nowMs);
        return true;

    case 0x2C:
        if (dataLen < 1)
            return false;
        formatPctA(data[0], val, sizeof(val));
        setMetricText(pid, "cmd_egr", val, "pct", true, false, false, nowMs);
        return true;

    case 0x2D:
        if (dataLen < 1)
            return false;
        {
            int16_t t = trim10(data[0]);
            splitSigned10(t, val, sizeof(val));
            setMetricText(pid, "egr_error", val, "pct", true, false, false, nowMs);
        }
        return true;

    case 0x2E:
        if (dataLen < 1)
            return false;
        formatPctA(data[0], val, sizeof(val));
        setMetricText(pid, "evap_purge", val, "pct", true, false, false, nowMs);
        return true;

    case 0x30:
        if (dataLen < 1)
            return false;
        snprintf(val, sizeof(val), "%u", (unsigned int)data[0]);
        setMetricText(pid, "warmups", val, "", true, false, false, nowMs);
        return true;

    case 0x31:
        if (dataLen < 2)
            return false;
        snprintf(val, sizeof(val), "%u", (unsigned int)be16(data));
        setMetricText(pid, "dist_clear", val, "km", true, false, false, nowMs);
        return true;

    case 0x32:
        if (dataLen < 2)
            return false;
        {
            uint32_t pa = (uint32_t)be16(data) / 4UL;
            snprintf(val, sizeof(val), "%lu.%02lu",
                     (unsigned long)(pa / 1000UL),
                     (unsigned long)((pa % 1000UL) / 10UL));
            setMetricText(pid, "evap_press", val, "kPa", true, false, false, nowMs);
        }
        return true;

    case 0x33:
        if (dataLen < 1)
            return false;
        snprintf(val, sizeof(val), "%u", (unsigned int)data[0]);
        setMetricText(pid, "baro", val, "kPa", true, false, false, nowMs);
        return true;

    case 0x3C:
    case 0x3D:
    case 0x3E:
    case 0x3F:
        if (dataLen < 2)
            return false;
        {
            int32_t c10 = (int32_t)be16(data) - 400;
            snprintf(val, sizeof(val), "%ld.%ld", (long)(c10 / 10), (long)abs((int)(c10 % 10)));
            snprintf(key, sizeof(key), "cat_temp_%02X", (unsigned int)pid);
            setMetricText(pid, key, val, "C", true, false, false, nowMs);
        }
        return true;

    case 0x42:
        if (dataLen < 2)
            return false;
        {
            uint16_t mv = be16(data);
            compactSample_.ecuMv = mv;
            markCompactField(kCompactEcuVoltage, nowMs);
            snprintf(val, sizeof(val), "%u.%03u", (unsigned int)(mv / 1000), (unsigned int)(mv % 1000));
            warn = (mv < 11800);
            err = (mv < 11000);
            setMetricText(pid, "ecu_v", val, "V", true, warn, err, nowMs);
        }
        return true;

    case 0x41:
        if (dataLen < 4)
            return false;
        snprintf(val, sizeof(val), "0x%02X%02X%02X%02X",
                 (unsigned int)data[0],
                 (unsigned int)data[1],
                 (unsigned int)data[2],
                 (unsigned int)data[3]);
        setMetricText(pid, "monitor_dc", val, "", true, false, false, nowMs);
        return true;

    case 0x43:
        if (dataLen < 2)
            return false;
        {
            uint32_t load10 = ((uint32_t)be16(data) * 1000UL) / 255UL;
            snprintf(val, sizeof(val), "%lu.%lu", (unsigned long)(load10 / 10), (unsigned long)(load10 % 10));
            setMetricText(pid, "abs_load", val, "pct", true, false, false, nowMs);
        }
        return true;

    case 0x44:
        if (dataLen < 2)
            return false;
        {
            uint32_t eq1000 = ((uint32_t)be16(data) * 1000UL) / 32768UL;
            snprintf(val, sizeof(val), "%lu.%03lu", (unsigned long)(eq1000 / 1000), (unsigned long)(eq1000 % 1000));
            setMetricText(pid, "eq_ratio", val, "", true, false, false, nowMs);
        }
        return true;

    case 0x45:
    case 0x47:
    case 0x48:
    case 0x49:
    case 0x4A:
    case 0x4B:
    case 0x4C:
    case 0x5A:
        if (dataLen < 1)
            return false;
        formatPctA(data[0], val, sizeof(val));
        snprintf(key, sizeof(key), "pos_%02X", (unsigned int)pid);
        setMetricText(pid, key, val, "pct", true, false, false, nowMs);
        return true;

    case 0x46:
        if (dataLen < 1)
            return false;
        snprintf(val, sizeof(val), "%d", (int)tempA(data[0]));
        setMetricText(pid, "ambient", val, "C", true, false, false, nowMs);
        return true;

    case 0x34:
    case 0x35:
    case 0x36:
    case 0x37:
    case 0x38:
    case 0x39:
    case 0x3A:
    case 0x3B:
        if (dataLen < 4)
            return false;
        {
            uint32_t lambda1000 = ((uint32_t)be16(data) * 1000UL) / 32768UL;
            int16_t ma10 = (int16_t)((((int32_t)be16(data + 2)) * 10L / 256L) - 1280L);
            char maTxt[12];
            splitSigned10(ma10, maTxt, sizeof(maTxt));
            snprintf(val, sizeof(val), "%lu.%03lu|%s",
                     (unsigned long)(lambda1000 / 1000UL),
                     (unsigned long)(lambda1000 % 1000UL),
                     maTxt);
            snprintf(key, sizeof(key), "o2wr_%02X", (unsigned int)pid);
            setMetricText(pid, key, val, "L|mA", true, false, false, nowMs);
        }
        return true;

    case 0x51:
        if (dataLen < 1)
            return false;
        snprintf(val, sizeof(val), "%u:%s", (unsigned int)data[0], fuelTypeName(data[0]));
        setMetricText(pid, "fuel_type", val, "", true, false, false, nowMs);
        return true;

    case 0x52:
        if (dataLen < 1)
            return false;
        formatPctA(data[0], val, sizeof(val));
        setMetricText(pid, "ethanol", val, "pct", true, false, false, nowMs);
        return true;

    case 0x5C:
        if (dataLen < 1)
            return false;
        snprintf(val, sizeof(val), "%d", (int)tempA(data[0]));
        setMetricText(pid, "oil_temp", val, "C", true, false, false, nowMs);
        return true;

    case 0x53:
        if (dataLen < 2)
            return false;
        {
            uint32_t kpa1000 = (uint32_t)be16(data) * 5UL;
            snprintf(val, sizeof(val), "%lu.%03lu",
                     (unsigned long)(kpa1000 / 1000UL),
                     (unsigned long)(kpa1000 % 1000UL));
            setMetricText(pid, "evap_abs", val, "kPa", true, false, false, nowMs);
        }
        return true;

    case 0x54:
        if (dataLen < 2)
            return false;
        {
            int32_t pa = ((int32_t)be16(data) - 32768L) / 4L;
            snprintf(val, sizeof(val), "%ld", (long)pa);
            setMetricText(pid, "evap_s", val, "Pa", true, false, false, nowMs);
        }
        return true;

    case 0x55:
    case 0x56:
    case 0x57:
    case 0x58:
        if (dataLen < 1)
            return false;
        {
            static const char *kTrimNames[] = {"stft_b1s2", "ltft_b1s2", "stft_b2s2", "ltft_b2s2"};
            int16_t t = trim10(data[0]);
            splitSigned10(t, val, sizeof(val));
            setMetricText(pid, kTrimNames[pid - 0x55], val, "pct", true, false, false, nowMs);
        }
        return true;

    case 0x59:
        if (dataLen < 2)
            return false;
        snprintf(val, sizeof(val), "%lu", (unsigned long)((uint32_t)be16(data) * 10UL));
        setMetricText(pid, "fuel_rail_a", val, "kPa", true, false, false, nowMs);
        return true;

    case 0x5B:
        if (dataLen < 1)
            return false;
        formatPctA(data[0], val, sizeof(val));
        setMetricText(pid, "hybrid_batt", val, "pct", true, false, false, nowMs);
        return true;

    case 0x5D:
        if (dataLen < 2)
            return false;
        {
            int16_t deg10 = (int16_t)((((int32_t)be16(data)) * 10L / 128L) - 2100L);
            splitSigned10(deg10, val, sizeof(val));
            setMetricText(pid, "inj_timing", val, "deg", true, false, false, nowMs);
        }
        return true;

    case 0x5E:
        if (dataLen < 2)
            return false;
        {
            uint32_t rate100 = ((uint32_t)be16(data) * 100UL) / 20UL;
            snprintf(val, sizeof(val), "%lu.%02lu", (unsigned long)(rate100 / 100), (unsigned long)(rate100 % 100));
            setMetricText(pid, "fuel_rate", val, "L/h", true, false, false, nowMs);
        }
        return true;

    case 0x5F:
        if (dataLen < 1)
            return false;
        snprintf(val, sizeof(val), "0x%02X", (unsigned int)data[0]);
        setMetricText(pid, "emis_req", val, "", true, false, false, nowMs);
        return true;

    case 0x4D:
        if (dataLen < 2)
            return false;
        snprintf(val, sizeof(val), "%u", (unsigned int)be16(data));
        setMetricText(pid, "time_mil", val, "min", true, false, false, nowMs);
        return true;

    case 0x4E:
        if (dataLen < 2)
            return false;
        snprintf(val, sizeof(val), "%u", (unsigned int)be16(data));
        setMetricText(pid, "time_clear", val, "min", true, false, false, nowMs);
        return true;

    case 0x50:
        if (dataLen < 1)
            return false;
        snprintf(val, sizeof(val), "%u", (unsigned int)((uint16_t)data[0] * 10U));
        setMetricText(pid, "maf_max", val, "g/s", true, false, false, nowMs);
        return true;

    default:
        return false;
    }
}

void ObdService::parseMode09Support(const uint8_t *data, uint8_t dataLen)
{
    if (dataLen < 4)
    {
        return;
    }

    uint32_t bits = ((uint32_t)data[0] << 24) |
                    ((uint32_t)data[1] << 16) |
                    ((uint32_t)data[2] << 8) |
                    ((uint32_t)data[3]);

    memset(mode09Supported_, 0, sizeof(mode09Supported_));
    for (uint8_t i = 0; i < 32; i++)
    {
        if ((bits & (1UL << (31 - i))) == 0)
        {
            continue;
        }
        uint8_t pid = (uint8_t)(0x01 + i);
        setPidBit(mode09Supported_, pid);
    }
    mode09SupportKnown_ = true;
}

void ObdService::parseMode06Support(uint8_t tid, const uint8_t *data, uint8_t dataLen)
{
    if (dataLen < 4)
    {
        return;
    }

    uint32_t bits = ((uint32_t)data[0] << 24) |
                    ((uint32_t)data[1] << 16) |
                    ((uint32_t)data[2] << 8) |
                    ((uint32_t)data[3]);

    for (uint8_t i = 0; i < 32; i++)
    {
        if ((bits & (1UL << (31 - i))) == 0)
        {
            continue;
        }

        uint16_t discovered = (uint16_t)tid + 1 + i;
        if (discovered >= 256)
        {
            continue;
        }

        if (setPidBit(mode06Supported_, (uint8_t)discovered))
        {
            if (vehicle_.mode06SupportedCount < 0xFF)
            {
                vehicle_.mode06SupportedCount++;
            }
        }
    }
}

uint8_t ObdService::nextMode06Tid()
{
    if (!mode06DiscoveryComplete_)
    {
        uint8_t tid = kSupportProbePids[mode06SupportCursor_];
        mode06SupportCursor_++;
        if (mode06SupportCursor_ >= (sizeof(kSupportProbePids) / sizeof(kSupportProbePids[0])))
        {
            mode06SupportCursor_ = 0;
            mode06DiscoveryComplete_ = true;
        }
        return tid;
    }

    for (uint16_t step = 0; step < 255; step++)
    {
        uint8_t tid = mode06TidCursor_;
        mode06TidCursor_++;
        if (mode06TidCursor_ == 0)
        {
            mode06TidCursor_ = 1;
        }
        if (isSupportPidValue(tid))
        {
            continue;
        }
        if (pidBit(mode06Supported_, tid))
        {
            return tid;
        }
    }

    mode06DiscoveryComplete_ = false;
    mode06SupportCursor_ = 0;
    return 0x00;
}

void ObdService::updateVehicleProfile()
{
    snprintf(vehicle_.profile,
             sizeof(vehicle_.profile),
             "%s",
             runtimeProfileActive_ ? runtimeProfile_.profileId : "generic_obd2");
}

ObdMode09EcuInfo *ObdService::mode09EcuForResponse(uint32_t responseId, bool extended)
{
    for (uint8_t i = 0; i < vehicle_.mode09EcuCount && i < ObdVehicleInfo::kMaxMode09Ecus; i++)
    {
        ObdMode09EcuInfo &ecu = vehicle_.mode09Ecus[i];
        if (ecu.responseId == responseId && ecu.extended == extended)
        {
            return &ecu;
        }
    }

    uint8_t slot = vehicle_.mode09EcuCount;
    if (slot >= ObdVehicleInfo::kMaxMode09Ecus)
    {
        return nullptr;
    }

    vehicle_.mode09EcuCount++;
    memset(&vehicle_.mode09Ecus[slot], 0, sizeof(vehicle_.mode09Ecus[slot]));
    vehicle_.mode09Ecus[slot].responseId = responseId;
    vehicle_.mode09Ecus[slot].extended = extended;
    resetMode09Chunks(slot);
    return &vehicle_.mode09Ecus[slot];
}

void ObdService::resetMode09Chunks(uint8_t slot)
{
    if (slot >= ObdVehicleInfo::kMaxMode09Ecus)
    {
        return;
    }

    uint32_t responseId = vehicle_.mode09Ecus[slot].responseId;
    bool extended = vehicle_.mode09Ecus[slot].extended;
    memset(&mode09Chunks_[slot], 0, sizeof(mode09Chunks_[slot]));
    mode09Chunks_[slot].responseId = responseId;
    mode09Chunks_[slot].extended = extended;
}

void ObdService::mirrorPrimaryMode09(const ObdMode09EcuInfo &ecu)
{
    bool primary = (vehicle_.vin[0] == '\0') || (ecu.responseId == 0x7E8);
    if (!primary)
    {
        return;
    }

    if (ecu.vin[0])
    {
        snprintf(vehicle_.vin, sizeof(vehicle_.vin), "%s", ecu.vin);
        vehicle_.lastVinMs = ecu.lastVinMs;
        updateVehicleProfile();
    }
    if (ecu.calid[0])
    {
        snprintf(vehicle_.calid, sizeof(vehicle_.calid), "%s", ecu.calid);
        vehicle_.lastCalIdMs = ecu.lastCalIdMs;
    }
    if (ecu.cvn[0])
    {
        snprintf(vehicle_.cvn, sizeof(vehicle_.cvn), "%s", ecu.cvn);
        vehicle_.lastCvnMs = ecu.lastCvnMs;
    }
    if (ecu.ecuName[0])
    {
        snprintf(vehicle_.ecuName, sizeof(vehicle_.ecuName), "%s", ecu.ecuName);
        vehicle_.lastEcuNameMs = ecu.lastEcuNameMs;
    }
    if (ecu.iptRaw[0])
    {
        snprintf(vehicle_.iptRaw, sizeof(vehicle_.iptRaw), "%s", ecu.iptRaw);
        vehicle_.lastIptMs = ecu.lastIptMs;
    }
}

void ObdService::updateMode09AsciiChunks(char *target,
                                         size_t targetSize,
                                         uint8_t *chunkLens,
                                         char chunks[16][5],
                                         uint8_t frameIdx,
                                         const uint8_t *payload,
                                         uint8_t payloadLen,
                                         uint32_t nowMs,
                                         uint32_t *lastUpdateMs,
                                         bool updateProfile)
{
    if (!target || targetSize == 0 || !chunkLens || !chunks || !lastUpdateMs || frameIdx >= 16)
    {
        return;
    }

    if (payloadLen > 4)
    {
        payloadLen = 4;
    }

    for (uint8_t i = 0; i < payloadLen; i++)
    {
        char c = (char)payload[i];
        if (c < 0x20 || c > 0x7E)
        {
            c = ' ';
        }
        chunks[frameIdx][i] = c;
    }
    chunkLens[frameIdx] = payloadLen;

    size_t pos = 0;
    target[0] = '\0';
    for (uint8_t f = 0; f < 16; f++)
    {
        uint8_t len = chunkLens[f];
        for (uint8_t i = 0; i < len && pos + 1 < targetSize; i++)
        {
            target[pos++] = chunks[f][i];
        }
    }
    target[pos] = '\0';

    while (pos > 0 && target[pos - 1] == ' ')
    {
        target[--pos] = '\0';
    }

    *lastUpdateMs = nowMs;
    if (updateProfile)
    {
        updateVehicleProfile();
    }
}

void ObdService::updateMode09HexChunks(char *target,
                                       size_t targetSize,
                                       uint8_t *chunkLens,
                                       uint8_t chunks[16][4],
                                       uint8_t frameIdx,
                                       const uint8_t *payload,
                                       uint8_t payloadLen,
                                       uint32_t nowMs,
                                       uint32_t *lastUpdateMs)
{
    if (!target || targetSize == 0 || !chunkLens || !chunks || !lastUpdateMs || frameIdx >= 16)
    {
        return;
    }

    if (payloadLen > 4)
    {
        payloadLen = 4;
    }

    for (uint8_t i = 0; i < payloadLen; i++)
    {
        chunks[frameIdx][i] = payload[i];
    }
    chunkLens[frameIdx] = payloadLen;

    size_t pos = 0;
    target[0] = '\0';
    for (uint8_t f = 0; f < 16; f++)
    {
        for (uint8_t i = 0; i < chunkLens[f]; i++)
        {
            if (pos + 3 >= targetSize)
            {
                target[pos] = '\0';
                *lastUpdateMs = nowMs;
                return;
            }
            int w = snprintf(target + pos, targetSize - pos, "%02X", chunks[f][i]);
            if (w <= 0)
            {
                break;
            }
            pos += (size_t)w;
        }
    }
    target[pos] = '\0';
    *lastUpdateMs = nowMs;
}

void ObdService::updateMode09Ascii(char *target,
                                   size_t targetSize,
                                   uint8_t *chunkLens,
                                   uint8_t frameIdx,
                                   const uint8_t *payload,
                                   uint8_t payloadLen,
                                   uint32_t nowMs,
                                   uint32_t *lastUpdateMs)
{
    if (target == vehicle_.vin)
    {
        updateMode09AsciiChunks(target, targetSize, chunkLens, vinChunks_, frameIdx, payload, payloadLen, nowMs, lastUpdateMs, true);
        return;
    }
    updateMode09AsciiChunks(target, targetSize, chunkLens, calidChunks_, frameIdx, payload, payloadLen, nowMs, lastUpdateMs, false);
}

void ObdService::updateMode09FullAscii(char *target,
                                       size_t targetSize,
                                       const uint8_t *payload,
                                       uint8_t payloadLen,
                                       uint32_t nowMs,
                                       uint32_t *lastUpdateMs)
{
    if (!target || targetSize == 0 || !payload || !lastUpdateMs)
    {
        return;
    }

    size_t pos = 0;
    for (uint8_t i = 0; i < payloadLen && pos + 1 < targetSize; i++)
    {
        char c = (char)payload[i];
        if (c < 0x20 || c > 0x7E)
        {
            continue;
        }
        target[pos++] = c;
    }
    target[pos] = '\0';
    while (pos > 0 && target[pos - 1] == ' ')
    {
        target[--pos] = '\0';
    }

    *lastUpdateMs = nowMs;
    if (target == vehicle_.vin)
    {
        updateVehicleProfile();
    }
}

void ObdService::updateMode09Hex(char *target,
                                 size_t targetSize,
                                 uint8_t *chunkLens,
                                 uint8_t frameIdx,
                                 const uint8_t *payload,
                                 uint8_t payloadLen,
                                 uint32_t nowMs,
                                 uint32_t *lastUpdateMs)
{
    updateMode09HexChunks(target, targetSize, chunkLens, cvnChunks_, frameIdx, payload, payloadLen, nowMs, lastUpdateMs);
}

void ObdService::updateMode09FullHex(char *target,
                                     size_t targetSize,
                                     const uint8_t *payload,
                                     uint8_t payloadLen,
                                     uint32_t nowMs,
                                     uint32_t *lastUpdateMs)
{
    if (!target || targetSize == 0 || !payload || !lastUpdateMs)
    {
        return;
    }

    formatDataHex(payload, payloadLen, target, targetSize);
    *lastUpdateMs = nowMs;
}

bool ObdService::parseMode09(const CAN_FRAME &frame, uint32_t nowMs)
{
    if (!isMode09Response(frame))
    {
        return false;
    }

    uint8_t payloadLen = singleFramePayloadLen(frame);
    if (payloadLen == 0 || payloadLen > frame.length - 1)
    {
        return false;
    }

    return parseMode09Payload(frame.id, frame.extended != 0, &frame.data.byte[1], payloadLen, false, nowMs);
}

bool ObdService::parseMode06(const CAN_FRAME &frame, uint32_t nowMs)
{
    if (!isMode06Response(frame))
    {
        return false;
    }

    uint8_t payloadLen = singleFramePayloadLen(frame);
    if (payloadLen == 0 || payloadLen > frame.length - 1)
    {
        return false;
    }

    return parseMode06Payload(&frame.data.byte[1], payloadLen, nowMs);
}

bool ObdService::parseMode06Payload(const uint8_t *payload, uint16_t payloadLen, uint32_t nowMs)
{
    if (!payload || payloadLen < 2 || payload[0] != 0x46)
    {
        return false;
    }

    uint8_t tid = payload[1];
    vehicle_.mode06LastTid = tid;
    formatDataHex(payload, payloadLen > 255 ? 255 : (uint8_t)payloadLen, vehicle_.mode06Raw, sizeof(vehicle_.mode06Raw));

    if (payloadLen >= 6 && isSupportPidValue(tid))
    {
        parseMode06Support(tid, &payload[2], 4);
        snprintf(vehicle_.mode06Summary,
                 sizeof(vehicle_.mode06Summary),
                 "sup%02X n=%u raw=%s",
                 (unsigned int)tid,
                 (unsigned int)vehicle_.mode06SupportedCount,
                 vehicle_.mode06Raw);
        vehicle_.lastMode06Ms = nowMs;
        return true;
    }

    if (payloadLen >= 8)
    {
        uint8_t testId = payload[2];
        uint8_t unit = payload[3];
        uint16_t value = be16(&payload[4]);
        uint16_t minValue = payloadLen >= 8 ? be16(&payload[6]) : 0;
        snprintf(vehicle_.mode06Summary,
                 sizeof(vehicle_.mode06Summary),
                 "tid=%02X test=%02X unit=%02X val=%u min=%u raw=%s",
                 (unsigned int)tid,
                 (unsigned int)testId,
                 (unsigned int)unit,
                 (unsigned int)value,
                 (unsigned int)minValue,
                 vehicle_.mode06Raw);
    }
    else
    {
        snprintf(vehicle_.mode06Summary,
                 sizeof(vehicle_.mode06Summary),
                 "tid=%02X raw=%s",
                 (unsigned int)tid,
                 vehicle_.mode06Raw);
    }

    vehicle_.lastMode06Ms = nowMs;
    return true;
}

bool ObdService::parseMode09Payload(uint32_t responseId, bool extended, const uint8_t *payload, uint16_t payloadLen, bool fullPayload, uint32_t nowMs)
{
    if (!payload || payloadLen < 2 || payload[0] != 0x49)
    {
        return false;
    }

    uint8_t pid = payload[1];
    if (pid == 0x00)
    {
        if (payloadLen >= 6)
        {
            parseMode09Support(&payload[2], 4);
        }
        return true;
    }

    if (payloadLen < 3)
    {
        return true;
    }

    uint8_t frameIdx = payload[2];
    const uint8_t *data = &payload[3];
    uint8_t dataLen = payloadLen > 3 ? (uint8_t)(payloadLen - 3) : 0;
    ObdMode09EcuInfo *ecu = mode09EcuForResponse(responseId, extended);
    if (!ecu)
    {
        return true;
    }

    uint8_t slot = (uint8_t)(ecu - vehicle_.mode09Ecus);
    Mode09ChunkState &chunks = mode09Chunks_[slot];
    ecu->lastUpdateMs = nowMs;

    if (pid == 0x02)
    {
        if (fullPayload || dataLen > 4)
        {
            updateMode09FullAscii(ecu->vin, sizeof(ecu->vin), data, dataLen, nowMs, &ecu->lastVinMs);
        }
        else
        {
            updateMode09AsciiChunks(ecu->vin,
                                    sizeof(ecu->vin),
                                    chunks.vinChunkLen,
                                    chunks.vinChunks,
                                    frameIdx,
                                    data,
                                    dataLen,
                                    nowMs,
                                    &ecu->lastVinMs,
                                    false);
        }
        mirrorPrimaryMode09(*ecu);
        return true;
    }

    if (pid == 0x04)
    {
        if (fullPayload || dataLen > 4)
        {
            updateMode09FullAscii(ecu->calid, sizeof(ecu->calid), data, dataLen, nowMs, &ecu->lastCalIdMs);
        }
        else
        {
            updateMode09AsciiChunks(ecu->calid,
                                    sizeof(ecu->calid),
                                    chunks.calidChunkLen,
                                    chunks.calidChunks,
                                    frameIdx,
                                    data,
                                    dataLen,
                                    nowMs,
                                    &ecu->lastCalIdMs,
                                    false);
        }
        mirrorPrimaryMode09(*ecu);
        return true;
    }

    if (pid == 0x06)
    {
        updateMode09HexChunks(ecu->cvn,
                              sizeof(ecu->cvn),
                              chunks.cvnChunkLen,
                              chunks.cvnChunks,
                              frameIdx,
                              data,
                              dataLen,
                              nowMs,
                              &ecu->lastCvnMs);
        mirrorPrimaryMode09(*ecu);
        return true;
    }

    if (pid == 0x08 || pid == 0x0B || pid == 0x0C)
    {
        updateMode09FullHex(ecu->iptRaw, sizeof(ecu->iptRaw), data, dataLen, nowMs, &ecu->lastIptMs);
        mirrorPrimaryMode09(*ecu);
        return true;
    }

    if (pid == 0x0A)
    {
        updateMode09FullAscii(ecu->ecuName, sizeof(ecu->ecuName), data, dataLen, nowMs, &ecu->lastEcuNameMs);
        mirrorPrimaryMode09(*ecu);
        return true;
    }

    return true;
}

bool ObdService::parseRawServiceResponse(const CAN_FRAME &frame,
                                         uint8_t positiveService,
                                         char *raw,
                                         size_t rawSize,
                                         uint32_t *lastUpdateMs,
                                         uint32_t nowMs)
{
    uint8_t payloadLen = singleFramePayloadLen(frame);
    if (!raw || rawSize == 0 || !lastUpdateMs || payloadLen < 1 || frame.length < 2 || frame.data.byte[1] != positiveService)
    {
        return false;
    }

    uint8_t rawLen = (uint8_t)(payloadLen + 1);
    if (rawLen > frame.length)
    {
        rawLen = frame.length;
    }
    formatDataHex(&frame.data.byte[0], rawLen, raw, rawSize);
    *lastUpdateMs = nowMs;
    return true;
}

bool ObdService::parseDtcResponse(const CAN_FRAME &frame,
                                  uint8_t positiveService,
                                  uint8_t *count,
                                  char dtcs[8][6],
                                  char *raw,
                                  size_t rawSize,
                                  uint32_t *lastUpdateMs,
                                  uint32_t nowMs)
{
    uint8_t payloadLen = singleFramePayloadLen(frame);
    if (!count || !dtcs || !lastUpdateMs || payloadLen < 1 || frame.length < 2 || frame.data.byte[1] != positiveService)
    {
        return false;
    }

    *count = 0;
    memset(dtcs, 0, sizeof(char) * 8U * 6U);

    if (raw && rawSize > 0)
    {
        raw[0] = '\0';
        uint8_t rawLen = (uint8_t)(payloadLen + 1);
        if (rawLen > frame.length)
        {
            rawLen = frame.length;
        }
        formatDataHex(&frame.data.byte[0], rawLen, raw, rawSize);
    }

    uint8_t end = (uint8_t)(1U + payloadLen);
    if (end > frame.length)
    {
        end = frame.length;
    }
    for (uint8_t i = 2; i + 1 < end && *count < 8; i += 2)
    {
        uint8_t a = frame.data.byte[i];
        uint8_t b = frame.data.byte[i + 1];
        if (a == 0 && b == 0)
        {
            continue;
        }

        decodeDtcWord(a, b, dtcs[*count]);
        (*count)++;
    }

    *lastUpdateMs = nowMs;
    return true;
}

bool ObdService::handleIsoTpPayload(uint32_t responseId, const uint8_t *payload, uint16_t payloadLen, uint32_t nowMs)
{
    if (!payload || payloadLen == 0)
    {
        return false;
    }

    if (payload[0] == 0x49)
    {
        bool ok = parseMode09Payload(responseId, false, payload, payloadLen, true, nowMs);
        if (ok)
        {
            decodedWindow_++;
        }
        return ok;
    }

    if (payload[0] == 0x46)
    {
        bool ok = parseMode06Payload(payload, payloadLen, nowMs);
        if (ok)
        {
            decodedWindow_++;
        }
        return ok;
    }

    return false;
}

bool ObdService::handleIsoTpFrame(const CAN_FRAME &frame, uint32_t nowMs)
{
    if (!isObdResponseFrame(frame) || frame.length < 2)
    {
        return false;
    }

    uint8_t pci = frame.data.byte[0];
    uint8_t type = pci & 0xF0;

    if (type == 0x10 && frame.length >= 3)
    {
        uint16_t expectedLen = (uint16_t)(((uint16_t)(pci & 0x0F) << 8) | frame.data.byte[1]);
        if (expectedLen == 0)
        {
            return false;
        }
        if (expectedLen > sizeof(isoTpRx_.payload))
        {
            expectedLen = sizeof(isoTpRx_.payload);
        }

        isoTpRx_ = {};
        isoTpRx_.active = true;
        isoTpRx_.extended = frame.extended != 0;
        isoTpRx_.responseId = frame.id;
        isoTpRx_.expectedLen = expectedLen;
        isoTpRx_.nextSeq = 1;
        isoTpRx_.len = boundedPayloadLen(frame.length - 2, expectedLen);
        memcpy(isoTpRx_.payload, &frame.data.byte[2], isoTpRx_.len);
        sendIsoTpFlowControl(frame);

        if (isoTpRx_.len >= isoTpRx_.expectedLen)
        {
            bool ok = handleIsoTpPayload(frame.id, isoTpRx_.payload, isoTpRx_.len, nowMs);
            isoTpRx_.active = false;
            return ok;
        }
        return true;
    }

    if (type != 0x20 || !isoTpRx_.active || frame.id != isoTpRx_.responseId || (frame.extended != 0) != isoTpRx_.extended)
    {
        return false;
    }

    uint8_t seq = pci & 0x0F;
    if (seq != isoTpRx_.nextSeq)
    {
        isoTpRx_.active = false;
        return true;
    }
    isoTpRx_.nextSeq = (uint8_t)((isoTpRx_.nextSeq + 1) & 0x0F);

    uint16_t remaining = isoTpRx_.expectedLen > isoTpRx_.len ? (isoTpRx_.expectedLen - isoTpRx_.len) : 0;
    uint8_t copyLen = boundedPayloadLen(frame.length - 1, remaining);
    if (copyLen > 0)
    {
        memcpy(&isoTpRx_.payload[isoTpRx_.len], &frame.data.byte[1], copyLen);
        isoTpRx_.len += copyLen;
    }

    if (isoTpRx_.len >= isoTpRx_.expectedLen)
    {
        bool ok = handleIsoTpPayload(frame.id, isoTpRx_.payload, isoTpRx_.len, nowMs);
        isoTpRx_.active = false;
        return ok;
    }

    return true;
}

bool ObdService::handleFrame(const CAN_FRAME &frame, uint32_t nowMs)
{
    if (!isObdResponseFrame(frame))
    {
        return false;
    }

    if (handleIsoTpFrame(frame, nowMs))
    {
        totalResponses_++;
        respWindow_++;
        return true;
    }

    totalResponses_++;
    respWindow_++;

    if (isMode02Response(frame))
    {
        bool ok = parseRawServiceResponse(frame,
                                          0x42,
                                          vehicle_.freezeFrameRaw,
                                          sizeof(vehicle_.freezeFrameRaw),
                                          &vehicle_.lastFreezeFrameMs,
                                          nowMs);
        if (ok)
        {
            decodedWindow_++;
        }
        return ok;
    }

    if (isMode09Response(frame))
    {
        bool ok = parseMode09(frame, nowMs);
        if (ok)
        {
            decodedWindow_++;
        }
        return ok;
    }

    if (isMode03Response(frame))
    {
        bool ok = parseDtcResponse(frame,
                                   0x43,
                                   &vehicle_.storedDtcCount,
                                   vehicle_.storedDtcs,
                                   vehicle_.storedDtcRaw,
                                   sizeof(vehicle_.storedDtcRaw),
                                   &vehicle_.lastDtcMs,
                                   nowMs);
        if (ok)
        {
            vehicle_.dtcCount = vehicle_.storedDtcCount;
            memcpy(vehicle_.dtcs, vehicle_.storedDtcs, sizeof(vehicle_.dtcs));
            decodedWindow_++;
        }
        return ok;
    }

    if (isMode06Response(frame))
    {
        bool ok = parseMode06(frame, nowMs);
        if (ok)
        {
            decodedWindow_++;
        }
        return ok;
    }

    if (isMode07Response(frame))
    {
        bool ok = parseDtcResponse(frame,
                                   0x47,
                                   &vehicle_.pendingDtcCount,
                                   vehicle_.pendingDtcs,
                                   vehicle_.pendingDtcRaw,
                                   sizeof(vehicle_.pendingDtcRaw),
                                   &vehicle_.lastPendingDtcMs,
                                   nowMs);
        if (ok)
        {
            decodedWindow_++;
        }
        return ok;
    }

    if (isMode0AResponse(frame))
    {
        bool ok = parseDtcResponse(frame,
                                   0x4A,
                                   &vehicle_.permanentDtcCount,
                                   vehicle_.permanentDtcs,
                                   vehicle_.permanentDtcRaw,
                                   sizeof(vehicle_.permanentDtcRaw),
                                   &vehicle_.lastPermanentDtcMs,
                                   nowMs);
        if (ok)
        {
            decodedWindow_++;
        }
        return ok;
    }

    if (!isMode01Response(frame))
    {
        return false;
    }

    uint8_t payloadLen = singleFramePayloadLen(frame);
    if (payloadLen < 2)
    {
        return false;
    }

    uint8_t pid = frame.data.byte[2];
    if (pid > kMaxPid)
    {
        return false;
    }
    uint8_t dataLen = boundedPayloadLen((uint8_t)(payloadLen - 2), frame.length > 3 ? (uint8_t)(frame.length - 3) : 0);
    const uint8_t *data = &frame.data.byte[3];
    recordMetricRaw(pid, data, dataLen, nowMs);
    markMode01Response(pid, nowMs);

    if (!isSupportBitmapPid(pid) && setPidBit(supported_, pid))
    {
        supportedCount_++;
        rebuildQueryPlan();
    }

    if (isSupportBitmapPid(pid))
    {
        handleSupportedBitmap(pid, data, dataLen, nowMs);
        decodedWindow_++;
        return true;
    }

    bool decoded = decodeMode01Pid(pid, data, dataLen, nowMs);
    if (decoded)
    {
        decodedWindow_++;
        return true;
    }

    setRawMetric(pid, data, dataLen, nowMs);
    setPidBit(rawSeen_, pid);
    return true;
}

uint16_t ObdService::collectSupportedPids(uint8_t *out, uint16_t maxOut) const
{
    if (!out || maxOut == 0)
    {
        return 0;
    }

    uint16_t count = 0;
    for (uint16_t pid = 1; pid <= kMaxPid && count < maxOut; pid++)
    {
        if (pidBit(supported_, (uint8_t)pid))
        {
            out[count++] = (uint8_t)pid;
        }
    }
    return count;
}

uint16_t ObdService::collectMetrics(ObdMetric *out, uint16_t maxOut) const
{
    if (!out || maxOut == 0)
    {
        return 0;
    }

    uint16_t count = 0;
    for (uint16_t pid = 1; pid <= kMaxPid && count < maxOut; pid++)
    {
        const ObdMetric &src = metrics_[pid];
        if (src.lastUpdateMs > 0)
        {
            out[count++] = src;
            continue;
        }

        if (pidBit(supported_, (uint8_t)pid))
        {
            ObdMetric tmp{};
            const Mode01PidMeta *meta = findMode01Meta((uint8_t)pid);
            tmp.mode = 0x01;
            tmp.pid = (uint8_t)pid;
            tmp.supported = true;
            tmp.decoded = false;
            snprintf(tmp.key, sizeof(tmp.key), "%s", meta ? meta->name : "");
            if (tmp.key[0] == '\0')
            {
                snprintf(tmp.key, sizeof(tmp.key), "pid_%02X", (unsigned int)pid);
            }
            snprintf(tmp.value, sizeof(tmp.value), "--");
            snprintf(tmp.unit, sizeof(tmp.unit), "%s", meta ? meta->unit : "");
            snprintf(tmp.formula, sizeof(tmp.formula), "%s", meta ? meta->formula : "");
            snprintf(tmp.category, sizeof(tmp.category), "%s", meta ? meta->category : defaultCategoryForPid((uint8_t)pid));
            snprintf(tmp.notes, sizeof(tmp.notes), "%s", "supported");
            out[count++] = tmp;
        }
    }

    return count;
}
