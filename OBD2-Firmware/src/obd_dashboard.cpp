#include "obd_dashboard.h"

#include <stdarg.h>
#include <stdio.h>
#include <string.h>

namespace
{
constexpr const char *C_RST = "\x1b[0m";
constexpr const char *C_CYA = "\x1b[36m";
constexpr const char *C_GRN = "\x1b[32m";
constexpr const char *C_YEL = "\x1b[33m";
constexpr const char *C_RED = "\x1b[31m";
constexpr const char *C_GRY = "\x1b[90m";

constexpr uint32_t kDecodedTableFreshMs = 180000;
constexpr uint8_t kMaxVisibleVagModules = 6;
constexpr uint8_t kMaxVisibleMissingModules = 12;

struct DashboardPidDef
{
    uint8_t pid;
    const char *label;
};

const DashboardPidDef kDashboardLive[] = {
    {0x0C, "RPM"},
    {0x0D, "Speed"},
    {0x05, "Coolant"},
    {0x42, "ECU volts"},
    {0x04, "LOAD"},
    {0x11, "Throttle"},
    {0x0B, "MAP"},
    {0x10, "MAF"},
    {0x2F, "Fuel"},
    {0x5C, "Oil temp"},
};

const DashboardPidDef kMissingWatch[] = {
    {0x2F, "fuel_level"},
    {0x10, "maf"},
    {0x5E, "fuel_rate"},
    {0x46, "ambient"},
};

const char *statusText(bool ok)
{
    return ok ? "UP" : "DOWN";
}

bool valuePresent(const char *value)
{
    return value && value[0] != '\0' && strcmp(value, "--") != 0;
}

bool metricHasDisplayValue(const ObdMetric *metric, uint32_t nowMs, uint32_t maxAgeMs)
{
    if (!metric || !metric->decoded || metric->lastUpdateMs == 0 || !valuePresent(metric->value))
    {
        return false;
    }

    uint32_t age = nowMs >= metric->lastUpdateMs ? (nowMs - metric->lastUpdateMs) : 0;
    return age <= maxAgeMs;
}

bool mode09HasResponse(const ObdVehicleInfo &vehicleInfo, uint32_t responseId)
{
    for (uint8_t i = 0; i < vehicleInfo.mode09EcuCount && i < ObdVehicleInfo::kMaxMode09Ecus; i++)
    {
        const ObdMode09EcuInfo &ecu = vehicleInfo.mode09Ecus[i];
        if (ecu.responseId == responseId && (ecu.calid[0] || ecu.cvn[0] || ecu.ecuName[0] || ecu.vin[0]))
        {
            return true;
        }
    }
    return false;
}

bool moduleHasFallbackObdInfo(const UdsVagModuleStatus &module, const ObdVehicleInfo &vehicleInfo)
{
    if (strcmp(module.address, "01") == 0)
    {
        return mode09HasResponse(vehicleInfo, 0x7E8);
    }
    if (strcmp(module.address, "02") == 0)
    {
        return mode09HasResponse(vehicleInfo, 0x7E9);
    }
    return false;
}

void formatCanId(uint32_t canId, char *out, size_t outSize)
{
    if (!out || outSize == 0)
    {
        return;
    }
    if (canId <= 0x7FF)
    {
        snprintf(out, outSize, "%03lX", (unsigned long)canId);
        return;
    }
    snprintf(out, outSize, "%08lX", (unsigned long)canId);
}

void formatDtcList(const char dtcs[][6], uint8_t count, char *out, size_t outSize)
{
    if (!out || outSize == 0)
    {
        return;
    }

    if (count == 0)
    {
        snprintf(out, outSize, "none");
        return;
    }

    out[0] = '\0';
    size_t pos = 0;
    uint8_t shown = count > 3 ? 3 : count;
    for (uint8_t i = 0; i < shown; i++)
    {
        int w = snprintf(out + pos, outSize - pos, "%s%s", i == 0 ? "" : ",", dtcs[i]);
        if (w <= 0)
        {
            break;
        }
        pos += (size_t)w;
        if (pos >= outSize)
        {
            out[outSize - 1] = '\0';
            return;
        }
    }

    if (count > shown && pos < outSize)
    {
        snprintf(out + pos, outSize - pos, "+%u", (unsigned int)(count - shown));
    }
}

void shortField(const char *src, char *out, size_t outSize, size_t maxChars)
{
    if (!out || outSize == 0)
    {
        return;
    }

    if (!src || src[0] == '\0')
    {
        snprintf(out, outSize, "--");
        return;
    }

    size_t len = strlen(src);
    size_t copyLen = len > maxChars ? maxChars : len;
    if (copyLen >= outSize)
    {
        copyLen = outSize - 1;
    }
    memcpy(out, src, copyLen);
    out[copyLen] = '\0';

    if (len > maxChars && copyLen + 2 < outSize)
    {
        out[copyLen] = '.';
        out[copyLen + 1] = '.';
        out[copyLen + 2] = '\0';
    }
}

} // namespace

void ObdDashboard::begin()
{
    started_ = true;
}

void ObdDashboard::setIntervalMs(uint32_t intervalMs)
{
    frameIntervalMs_ = intervalMs < 50 ? 50 : intervalMs;
}

uint32_t ObdDashboard::txPackets() const
{
    return txPackets_;
}

uint32_t ObdDashboard::txErrors() const
{
    return txErrors_;
}

void ObdDashboard::append(char *dst, size_t cap, size_t *pos, const char *fmt, ...)
{
    if (!dst || !pos || *pos >= cap)
    {
        return;
    }

    va_list args;
    va_start(args, fmt);
    int w = vsnprintf(dst + *pos, cap - *pos, fmt, args);
    va_end(args);

    if (w <= 0)
    {
        return;
    }

    size_t ws = static_cast<size_t>(w);
    if (ws >= (cap - *pos))
    {
        *pos = cap - 1;
    }
    else
    {
        *pos += ws;
    }
}

const ObdMetric *ObdDashboard::findMetricByPid(const ObdMetric *metrics, uint16_t count, uint8_t pid) const
{
    for (uint16_t i = 0; i < count; i++)
    {
        if (metrics[i].pid == pid)
        {
            return &metrics[i];
        }
    }
    return nullptr;
}

const char *ObdDashboard::colorForMetric(const ObdMetric &metric, uint32_t nowMs)
{
    if (metric.error)
    {
        return C_RED;
    }

    if (!metric.decoded)
    {
        return C_GRY;
    }

    uint32_t updateAge = (metric.lastUpdateMs == 0 || nowMs < metric.lastUpdateMs) ? 0 : (nowMs - metric.lastUpdateMs);
    if (updateAge > 15000)
    {
        return C_RED;
    }

    uint32_t changeAge = (metric.lastChangeMs == 0 || nowMs < metric.lastChangeMs) ? 0 : (nowMs - metric.lastChangeMs);
    if (changeAge > 5000 || metric.warn)
    {
        return C_YEL;
    }

    return C_GRN;
}

void ObdDashboard::renderKeyMetrics(char *dst,
                                    size_t cap,
                                    size_t *pos,
                                    uint32_t nowMs,
                                    const ObdMetric *metrics,
                                    uint16_t metricCount)
{
    append(dst, cap, pos, "%sOBD LIVE%s (tabla unica: solo valores leidos)\n", C_CYA, C_RST);
    append(dst, cap, pos, "PID DATO         VALOR        U      HZ   RAW              AGE\n");

    uint8_t shown = 0;
    for (uint8_t i = 0; i < (uint8_t)(sizeof(kDashboardLive) / sizeof(kDashboardLive[0])); i++)
    {
        const ObdMetric *m = findMetricByPid(metrics, metricCount, kDashboardLive[i].pid);
        if (!metricHasDisplayValue(m, nowMs, kDecodedTableFreshMs))
        {
            continue;
        }

        uint32_t updAge = nowMs >= m->lastUpdateMs ? (nowMs - m->lastUpdateMs) : 0;
        uint32_t hz10 = (m->avgIntervalMs == 0) ? 0 : (10000UL / m->avgIntervalMs);
        const char *clr = colorForMetric(*m, nowMs);
        append(dst, cap, pos,
               "%s%02X  %-12s %-12s %-6s %2lu.%lu  %-16s %3lus%s\n",
               clr,
               (unsigned int)m->pid,
               kDashboardLive[i].label,
               m->value,
               m->unit,
               (unsigned long)(hz10 / 10UL),
               (unsigned long)(hz10 % 10UL),
               m->raw[0] ? m->raw : "--",
               (unsigned long)(updAge / 1000UL),
               C_RST);
        shown++;
    }

    if (shown == 0)
    {
        append(dst, cap, pos, "%sEsperando metricas OBD decodificadas...%s\n", C_GRY, C_RST);
    }

    const ObdMetric *monitor = findMetricByPid(metrics, metricCount, 0x01);
    append(dst, cap, pos, "%sDIAG%s ", C_CYA, C_RST);
    if (metricHasDisplayValue(monitor, nowMs, kDecodedTableFreshMs))
    {
        append(dst, cap, pos, "%sMIL/DTC%s %-16s  ", colorForMetric(*monitor, nowMs), C_RST, monitor->value);
    }
    else
    {
        append(dst, cap, pos, "%sMIL/DTC%s --                ", C_GRY, C_RST);
    }
    append(dst, cap, pos, "%sSTD_DTC%s stored/pending/perm abajo\n", C_GRY, C_RST);
}

void ObdDashboard::renderFrame(ObdFrameBuffer *frame,
                               uint32_t nowMs,
                               const ObdDashboardState &state,
                               const ObdService &obdService,
                               const ObdVehicleInfo &vehicleInfo,
                               const UdsVagScanner &vagScanner)
{
    const size_t cap = sizeof(frame->data);
    uint16_t metricCount = obdService.collectMetrics(metricsScratch_, kMaxMetrics);
    uint8_t vagCount = vagScanner.collectModules(vagScratch_, UdsVagScanner::kMaxModules);
    const ObdMetric *metrics = metricsScratch_;

    size_t pos = 0;
    append(frame->data, cap, &pos, "\x1b[H\x1b[2J\x1b[3J\x1b[?25l");

    append(frame->data, cap, &pos,
           "%sAutoSense OBD2 Live%s  uptime=%lus  %sONE-SCREEN%s\n",
           C_CYA,
           C_RST,
           (unsigned long)(state.uptimeMs / 1000UL),
           C_GRN,
           C_RST);

    append(frame->data, cap, &pos,
           "link=%s%s%s can=%s%s%s query=%s%s%s mode=%s%s%s route=%s pids key/bg/q/sup=%u/%u/%u/%u\n",
           C_GRN,
           state.transport,
           C_RST,
           state.canOk ? C_GRN : C_RED,
           statusText(state.canOk),
           C_RST,
           state.queryMode ? C_GRN : C_GRY,
           state.queryMode ? "ACTIVE" : "PASSIVE",
           C_RST,
           state.ebookMode ? C_GRN : C_YEL,
           state.ebookMode ? "EBOOK" : "BASIC",
           C_RST,
           state.route,
           (unsigned int)state.keyPidCount,
           (unsigned int)state.bgPidCount,
           (unsigned int)state.queryPidCount,
           (unsigned int)state.supportedPidCount);

    append(frame->data, cap, &pos,
           "rate can=%lu rsp/s=%lu dec/s=%lu key/s=%lu bg/s=%lu guard=%lu vag=%s/%s/%lu\n",
           (unsigned long)state.canFps,
           (unsigned long)state.obdRspPerSec,
           (unsigned long)state.obdDecPerSec,
           (unsigned long)state.keyQueryPerSec,
           (unsigned long)state.bgQueryPerSec,
           (unsigned long)state.readGuardBlocked,
           state.vagEnabled ? "ON" : "OFF",
           state.vagActive ? "BUSY" : "IDLE",
           (unsigned long)state.vagGuardBlocked);

    append(frame->data, cap, &pos,
           "log=%s%s%s seq=%lu rec=%lu/%lu every=%lus err=%lu | vin=%s profile=%s\n",
           (state.logReady && state.logEnabled) ? C_GRN : (state.logReady ? C_YEL : C_RED),
           state.logReady ? (state.logEnabled ? "ON" : "OFF") : "DOWN",
           C_RST,
           (unsigned long)state.logSequence,
           (unsigned long)state.logRecords,
           (unsigned long)state.logCapacity,
           (unsigned long)state.logIntervalSeconds,
           (unsigned long)state.logErrors,
           (vehicleInfo.vin[0] ? vehicleInfo.vin : "--"),
           (vehicleInfo.profile[0] ? vehicleInfo.profile : "generic"));

    renderKeyMetrics(frame->data, cap, &pos, nowMs, metrics, metricCount);

    char storedDtc[32];
    char pendingDtc[32];
    char permanentDtc[32];
    char calidShort[18];
    char cvnShort[18];
    char ecuNameShort[18];
    char iptShort[18];
    char freezeShort[18];
    char mode06Short[40];
    formatDtcList(vehicleInfo.storedDtcs, vehicleInfo.storedDtcCount, storedDtc, sizeof(storedDtc));
    formatDtcList(vehicleInfo.pendingDtcs, vehicleInfo.pendingDtcCount, pendingDtc, sizeof(pendingDtc));
    formatDtcList(vehicleInfo.permanentDtcs, vehicleInfo.permanentDtcCount, permanentDtc, sizeof(permanentDtc));
    shortField(vehicleInfo.calid, calidShort, sizeof(calidShort), 14);
    shortField(vehicleInfo.cvn, cvnShort, sizeof(cvnShort), 14);
    shortField(vehicleInfo.ecuName, ecuNameShort, sizeof(ecuNameShort), 14);
    shortField(vehicleInfo.iptRaw, iptShort, sizeof(iptShort), 14);
    shortField(vehicleInfo.freezeFrameRaw, freezeShort, sizeof(freezeShort), 14);
    shortField(vehicleInfo.mode06Summary[0] ? vehicleInfo.mode06Summary : vehicleInfo.mode06Raw,
               mode06Short,
               sizeof(mode06Short),
               36);

    append(frame->data, cap, &pos,
           "%sDIAG STD%s  03=%s  07=%s  0A=%s  FF=%s  M06=%s\n",
           C_CYA,
           C_RST,
           storedDtc,
           pendingDtc,
           permanentDtc,
           freezeShort,
           mode06Short);

    if (vehicleInfo.mode09EcuCount > 0)
    {
        append(frame->data, cap, &pos, "%sECU ID%s  MODULO                 CALID                  CVN\n", C_CYA, C_RST);
        uint8_t ecuRows = vehicleInfo.mode09EcuCount;
        if (ecuRows > ObdVehicleInfo::kMaxMode09Ecus)
        {
            ecuRows = ObdVehicleInfo::kMaxMode09Ecus;
        }
        for (uint8_t i = 0; i < ecuRows; i++)
        {
            const ObdMode09EcuInfo &ecu = vehicleInfo.mode09Ecus[i];
            char idText[10];
            char ecuShort[24];
            char ecuCalidShort[24];
            char ecuCvnShort[18];
            if (ecu.responseId <= 0x7FF)
            {
                snprintf(idText, sizeof(idText), "%03lX", (unsigned long)ecu.responseId);
            }
            else
            {
                snprintf(idText, sizeof(idText), "%08lX", (unsigned long)ecu.responseId);
            }
            shortField(ecu.ecuName, ecuShort, sizeof(ecuShort), 20);
            shortField(ecu.calid, ecuCalidShort, sizeof(ecuCalidShort), 20);
            shortField(ecu.cvn, ecuCvnShort, sizeof(ecuCvnShort), 14);
            append(frame->data, cap, &pos,
                   "%-7s %-22s %-22s %s\n",
                   idText,
                   ecuShort,
                   ecuCalidShort,
                   ecuCvnShort);
        }
    }
    else
    {
        append(frame->data, cap, &pos,
               "%sMode09%s calid=%s cvn=%s ecu=%s ipt=%s\n",
               C_CYA,
               C_RST,
               calidShort,
               cvnShort,
               ecuNameShort,
               iptShort);
    }

    append(frame->data, cap, &pos, "%sNo leido OBD:%s ", C_YEL, C_RST);
    uint8_t missingPidCount = 0;
    for (uint8_t i = 0; i < (uint8_t)(sizeof(kMissingWatch) / sizeof(kMissingWatch[0])); i++)
    {
        const ObdMetric *m = findMetricByPid(metrics, metricCount, kMissingWatch[i].pid);
        if (metricHasDisplayValue(m, nowMs, kDecodedTableFreshMs))
        {
            continue;
        }
        append(frame->data, cap, &pos, "%s%s", missingPidCount == 0 ? "" : ", ", kMissingWatch[i].label);
        missingPidCount++;
    }
    if (missingPidCount == 0)
    {
        append(frame->data, cap, &pos, "--");
    }
    append(frame->data, cap, &pos, "\n");

    append(frame->data, cap, &pos, "%sVW/VAG leido%s (UDS solo lectura)\n", C_CYA, C_RST);
    append(frame->data, cap, &pos, "ADR NAME       PART/SW              DTC                  NOTE\n");
    uint8_t printed = 0;
    uint8_t hiddenPresent = 0;
    for (uint8_t i = 0; i < vagCount; i++)
    {
        const UdsVagModuleStatus &m = vagScratch_[i];
        if (!m.present)
        {
            continue;
        }
        if (printed >= kMaxVisibleVagModules)
        {
            hiddenPresent++;
            continue;
        }
        if ((cap - pos) < 96)
        {
            break;
        }

        char dtcText[32] = "--";
        if (m.dtcCount > 0)
        {
            dtcText[0] = '\0';
            size_t dpos = 0;
            for (uint8_t d = 0; d < m.dtcCount && d < 2; d++)
            {
                int w = snprintf(dtcText + dpos,
                                 sizeof(dtcText) - dpos,
                                 "%s%s",
                                 d == 0 ? "" : ",",
                                 m.dtcs[d]);
                if (w <= 0)
                {
                    break;
                }
                dpos += (size_t)w;
                if (dpos >= sizeof(dtcText))
                {
                    break;
                }
            }
        }

        append(frame->data, cap, &pos,
               "%-3s %-10s %-20s %-20s %s\n",
               m.address,
               m.name,
               m.partNumber[0] ? m.partNumber : (m.swNumber[0] ? m.swNumber : "--"),
               dtcText,
               m.lastError[0] ? m.lastError : "--");
        printed++;
    }
    if (hiddenPresent > 0)
    {
        append(frame->data, cap, &pos, "%s... %u modulos leidos mas ocultos para mantener una pantalla%s\n",
               C_GRY,
               (unsigned int)hiddenPresent,
               C_RST);
    }
    if (printed == 0)
    {
        append(frame->data, cap, &pos, "%sEsperando modulos VW/VAG...%s\n", C_GRY, C_RST);
    }

    uint8_t obdFallbackCount = 0;
    for (uint8_t i = 0; i < vagCount; i++)
    {
        const UdsVagModuleStatus &m = vagScratch_[i];
        if (!m.present && moduleHasFallbackObdInfo(m, vehicleInfo))
        {
            if (obdFallbackCount == 0)
            {
                append(frame->data, cap, &pos, "%sLeido por OBD:%s ", C_CYA, C_RST);
            }
            append(frame->data, cap, &pos, "%s%s", obdFallbackCount == 0 ? "" : ", ", m.name);
            obdFallbackCount++;
        }
    }
    if (obdFallbackCount > 0)
    {
        append(frame->data, cap, &pos, " (Mode09/Mode01)\n");
    }

    append(frame->data, cap, &pos, "%sNo leido UDS:%s ", C_YEL, C_RST);
    uint8_t missedModules = 0;
    uint8_t hiddenMissedModules = 0;
    for (uint8_t i = 0; i < vagCount; i++)
    {
        const UdsVagModuleStatus &m = vagScratch_[i];
        if (moduleHasFallbackObdInfo(m, vehicleInfo))
        {
            continue;
        }
        if (m.present || m.timeouts == 0)
        {
            continue;
        }
        if (missedModules >= kMaxVisibleMissingModules)
        {
            hiddenMissedModules++;
            continue;
        }
        if ((cap - pos) < 36)
        {
            append(frame->data, cap, &pos, "...");
            break;
        }
        char reqText[10];
        char rspText[10];
        formatCanId(m.requestId, reqText, sizeof(reqText));
        formatCanId(m.responseId, rspText, sizeof(rspText));
        append(frame->data, cap, &pos,
               "%s%s@%s>%s:%s",
               missedModules == 0 ? "" : ", ",
               m.name,
               reqText,
               rspText,
               m.lastError[0] ? m.lastError : "no-rsp");
        missedModules++;
    }
    if (hiddenMissedModules > 0)
    {
        append(frame->data, cap, &pos, " +%u", (unsigned int)hiddenMissedModules);
    }
    if (missedModules == 0)
    {
        append(frame->data, cap, &pos, "--");
    }
    append(frame->data, cap, &pos, "\n");

    frame->len = pos;
}

bool ObdDashboard::sendFrameTo()
{
    size_t written = Serial.write((const uint8_t *)frame_.data, frame_.len);
    if (written != frame_.len)
    {
        txErrors_++;
        return false;
    }

    txPackets_++;
    return true;
}

void ObdDashboard::tick(uint32_t nowMs,
                        const ObdDashboardState &state,
                        const ObdService &obdService,
                        const ObdVehicleInfo &vehicleInfo,
                        const UdsVagScanner &vagScanner)
{
    if (!started_)
    {
        return;
    }

    if (nowMs - lastFrameMs_ < frameIntervalMs_)
    {
        return;
    }

    lastFrameMs_ = nowMs;

    renderFrame(&frame_, nowMs, state, obdService, vehicleInfo, vagScanner);
    sendFrameTo();
}
