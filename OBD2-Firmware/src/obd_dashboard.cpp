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

constexpr uint32_t kPageRotateMs = 2000;
constexpr uint16_t kPageRowsPerFrame = 6;

const uint8_t kKeyPidOrder[] = {
    0x0C, 0x0D, 0x05, 0x11, 0x2F, 0x10, 0x0B, 0x0F, 0x42, 0x5C, 0x5E,
};

const char *statusText(bool ok)
{
    return ok ? "UP" : "DOWN";
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
    append(dst, cap, pos, "%sKey Metrics%s\n", C_CYA, C_RST);
    for (uint8_t pid : kKeyPidOrder)
    {
        const ObdMetric *m = findMetricByPid(metrics, metricCount, pid);
        if (!m)
        {
            append(dst, cap, pos, "%s[%02X]%-14s%s : --\n", C_GRY, (unsigned int)pid, "n/a", C_RST);
            continue;
        }

        const char *clr = colorForMetric(*m, nowMs);
        append(dst, cap, pos, "%s[%02X]%-14s%s : %-14s %-8s\n",
               clr,
               (unsigned int)m->pid,
               m->key,
               C_RST,
               m->value,
               m->unit);
    }
    append(dst, cap, pos, "\n");
}

void ObdDashboard::renderFrame(ObdFrameBuffer *frame,
                               uint32_t nowMs,
                               const ObdDashboardState &state,
                               const ObdService &obdService,
                               const ObdVehicleInfo &vehicleInfo)
{
    const size_t cap = sizeof(frame->data);
    uint16_t metricCount = obdService.collectMetrics(metricsScratch_, kMaxMetrics);
    const ObdMetric *metrics = metricsScratch_;
    const uint16_t pageRows = kPageRowsPerFrame;

    if (metricCount == 0)
    {
        pageIndex_ = 0;
    }

    uint16_t pages = (metricCount == 0) ? 1 : (uint16_t)((metricCount + pageRows - 1) / pageRows);
    if (pageIndex_ >= pages)
    {
        pageIndex_ = 0;
    }

    if (nowMs - lastPageSwitchMs_ >= kPageRotateMs)
    {
        pageIndex_ = (uint16_t)((pageIndex_ + 1) % pages);
        lastPageSwitchMs_ = nowMs;
    }

    size_t pos = 0;
    append(frame->data, cap, &pos, "\x1b[2J\x1b[H\x1b[?25l");

    append(frame->data, cap, &pos,
           "%sOBD2 DASHBOARD%s  uptime=%lus\n",
           C_CYA,
           C_RST,
           (unsigned long)(state.uptimeMs / 1000UL));

    append(frame->data, cap, &pos,
           "link=%s%s%s  can=%s%s%s  query=%s%s%s  mode=%s%s%s  route=%s  key_pids=%u  bg_pids=%u  q_pids=%u  sup_pids=%u\n",
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
           "fps: can=%lu rsp/s=%lu decoded/s=%lu key_q/s=%lu bg_q/s=%lu\n\n",
           (unsigned long)state.canFps,
           (unsigned long)state.obdRspPerSec,
           (unsigned long)state.obdDecPerSec,
           (unsigned long)state.keyQueryPerSec,
           (unsigned long)state.bgQueryPerSec);

    append(frame->data, cap, &pos,
           "log=%s%s%s seq=%lu records=%lu/%lu interval=%lus err=%lu\n\n",
           (state.logReady && state.logEnabled) ? C_GRN : (state.logReady ? C_YEL : C_RED),
           state.logReady ? (state.logEnabled ? "ON" : "OFF") : "DOWN",
           C_RST,
           (unsigned long)state.logSequence,
           (unsigned long)state.logRecords,
           (unsigned long)state.logCapacity,
           (unsigned long)state.logIntervalSeconds,
           (unsigned long)state.logErrors);

    renderKeyMetrics(frame->data, cap, &pos, nowMs, metrics, metricCount);

    append(frame->data, cap, &pos,
           "%sMode 09%s  vin=%s  calid=%s  cvn=%s\n",
           C_CYA,
           C_RST,
           (vehicleInfo.vin[0] ? vehicleInfo.vin : "--"),
           (vehicleInfo.calid[0] ? vehicleInfo.calid : "--"),
           (vehicleInfo.cvn[0] ? vehicleInfo.cvn : "--"));

    append(frame->data, cap, &pos, "%sMode 03%s  dtc=", C_CYA, C_RST);
    if (vehicleInfo.dtcCount == 0)
    {
        append(frame->data, cap, &pos, "none\n\n");
    }
    else
    {
        for (uint8_t i = 0; i < vehicleInfo.dtcCount; i++)
        {
            append(frame->data, cap, &pos, "%s%s", (i == 0) ? "" : ",", vehicleInfo.dtcs[i]);
        }
        append(frame->data, cap, &pos, "\n\n");
    }

    append(frame->data, cap, &pos,
           "%sAll OBD Metrics%s page %u/%u (rows %u)\n",
           C_CYA,
           C_RST,
           (unsigned int)(pages == 0 ? 0 : (pageIndex_ + 1)),
           (unsigned int)pages,
           (unsigned int)pageRows);

    append(frame->data, cap, &pos, "PID   KEY                VALUE                UNIT      UPD  CHG\n");

    uint16_t start = (uint16_t)(pageIndex_ * pageRows);
    uint16_t end = start + pageRows;
    if (end > metricCount)
    {
        end = metricCount;
    }

    for (uint16_t i = start; i < end; i++)
    {
        if ((cap - pos) < 96)
        {
            break;
        }

        const ObdMetric &m = metrics[i];
        uint32_t updAge = (m.lastUpdateMs == 0 || nowMs < m.lastUpdateMs) ? 0 : (nowMs - m.lastUpdateMs);
        uint32_t chgAge = (m.lastChangeMs == 0 || nowMs < m.lastChangeMs) ? 0 : (nowMs - m.lastChangeMs);
        const char *clr = colorForMetric(m, nowMs);
        append(frame->data, cap, &pos,
               "%s%02X    %-18s %-20s %-8s %3lus %3lus%s\n",
               clr,
               (unsigned int)m.pid,
               m.key,
               m.value,
               m.unit,
               (unsigned long)(updAge / 1000UL),
               (unsigned long)(chgAge / 1000UL),
               C_RST);
    }

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
                        const ObdVehicleInfo &vehicleInfo)
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

    renderFrame(&frame_, nowMs, state, obdService, vehicleInfo);
    sendFrameTo();
}
