#pragma once

#include <Arduino.h>
#include <WiFiUdp.h>

#include "obd_service.h"

struct ObdDashboardState
{
    bool wifiUp{false};
    bool canOk{false};
    bool queryMode{false};
    uint16_t queryPidCount{0};
    uint16_t keyPidCount{0};
    uint16_t bgPidCount{0};
    uint16_t supportedPidCount{0};
    uint32_t canFps{0};
    uint32_t obdRspPerSec{0};
    uint32_t obdDecPerSec{0};
    uint32_t keyQueryPerSec{0};
    uint32_t bgQueryPerSec{0};
    uint32_t uptimeMs{0};
    int32_t rssi{0};
    bool logReady{false};
    bool logEnabled{false};
    uint32_t logSequence{0};
    uint32_t logRecords{0};
    uint32_t logCapacity{0};
    uint32_t logErrors{0};
    uint32_t logIntervalSeconds{0};
    char mode01Route[8]{"7DF"};
};

struct ObdFrameBuffer
{
    static constexpr size_t kCapacity = 1200;

    char data[kCapacity]{0};
    size_t len{0};
};

class ObdDashboard
{
public:
    static constexpr uint16_t kMaxMetrics = 256;

    void begin(IPAddress host, uint16_t port);
    void setIntervalMs(uint32_t intervalMs);
    void setTarget(IPAddress host, uint16_t port);
    IPAddress target() const;
    uint32_t txPackets() const;
    uint32_t txErrors() const;

    void tick(uint32_t nowMs,
              const ObdDashboardState &state,
              const ObdService &obdService,
              const ObdVehicleInfo &vehicleInfo);

private:
    static const char *colorForMetric(const ObdMetric &metric, uint32_t nowMs);
    static void append(char *dst, size_t cap, size_t *pos, const char *fmt, ...);

    void renderFrame(ObdFrameBuffer *frame,
                     uint32_t nowMs,
                     const ObdDashboardState &state,
                     const ObdService &obdService,
                     const ObdVehicleInfo &vehicleInfo);
    bool sendFrameTo(IPAddress host);

    void renderKeyMetrics(char *dst,
                          size_t cap,
                          size_t *pos,
                          uint32_t nowMs,
                          const ObdMetric *metrics,
                          uint16_t metricCount);

    const ObdMetric *findMetricByPid(const ObdMetric *metrics, uint16_t count, uint8_t pid) const;

    WiFiUDP udp_;
    IPAddress host_;
    uint16_t port_{0};
    bool started_{false};
    uint32_t frameIntervalMs_{200};

    uint32_t lastFrameMs_{0};
    uint32_t lastPageSwitchMs_{0};
    uint16_t pageIndex_{0};
    uint32_t txPackets_{0};
    uint32_t txErrors_{0};

    ObdMetric metricsScratch_[kMaxMetrics]{};
    ObdFrameBuffer frame_{};
};
