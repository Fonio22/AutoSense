#pragma once

#include <Arduino.h>

#include "obd_service.h"
#include "uds_vag_scanner.h"

struct ObdDashboardState
{
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
    uint32_t readGuardBlocked{0};
    bool vagEnabled{false};
    bool vagActive{false};
    uint32_t vagGuardBlocked{0};
    uint32_t uptimeMs{0};
    bool logReady{false};
    bool logEnabled{false};
    uint32_t logSequence{0};
    uint32_t logRecords{0};
    uint32_t logCapacity{0};
    uint32_t logErrors{0};
    uint32_t logIntervalSeconds{0};
    bool ebookMode{true};
    char route[8]{"7DF"};
    char transport[12]{"USB-CDC"};
};

struct ObdFrameBuffer
{
    static constexpr size_t kCapacity = 3600;

    char data[kCapacity]{0};
    size_t len{0};
};

class ObdDashboard
{
public:
    static constexpr uint16_t kMaxMetrics = 256;

    void begin();
    void setIntervalMs(uint32_t intervalMs);
    uint32_t txPackets() const;
    uint32_t txErrors() const;

    void tick(uint32_t nowMs,
              const ObdDashboardState &state,
              const ObdService &obdService,
              const ObdVehicleInfo &vehicleInfo,
              const UdsVagScanner &vagScanner);

private:
    static const char *colorForMetric(const ObdMetric &metric, uint32_t nowMs);
    static void append(char *dst, size_t cap, size_t *pos, const char *fmt, ...);

    void renderFrame(ObdFrameBuffer *frame,
                     uint32_t nowMs,
                     const ObdDashboardState &state,
                     const ObdService &obdService,
                     const ObdVehicleInfo &vehicleInfo,
                     const UdsVagScanner &vagScanner);
    bool sendFrameTo();

    void renderKeyMetrics(char *dst,
                          size_t cap,
                          size_t *pos,
                          uint32_t nowMs,
                          const ObdMetric *metrics,
                          uint16_t metricCount);

    const ObdMetric *findMetricByPid(const ObdMetric *metrics, uint16_t count, uint8_t pid) const;

    bool started_{false};
    uint32_t frameIntervalMs_{1000};

    uint32_t lastFrameMs_{0};
    uint32_t txPackets_{0};
    uint32_t txErrors_{0};

    ObdMetric metricsScratch_[kMaxMetrics]{};
    UdsVagModuleStatus vagScratch_[UdsVagScanner::kMaxModules]{};
    ObdFrameBuffer frame_{};
};
