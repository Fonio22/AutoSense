#pragma once

#include <Arduino.h>

struct AppRuntimeConfig
{
    bool loggingEnabled{true};
    uint32_t loggingIntervalSeconds{10};
    uint32_t loggingMaxSampleAgeSeconds{15};
    bool anomalyEnabled{true};
    uint32_t anomalyIntervalSeconds{10};
    uint32_t anomalyMinSamples{300};
    uint32_t anomalySaveIntervalSeconds{300};
    uint8_t anomalyZWeight{70};
    uint8_t anomalyIForestWeight{30};
    bool anomalyDebugLogs{false};
    bool dashboardEnabled{true};
    bool dashboardEbookMode{true};
    uint32_t dashboardIntervalMs{1000};
    bool obdDiagnosticInfoEnabled{true};
    bool vagExtendedEnabled{false};
};

bool loadAppRuntimeConfig(AppRuntimeConfig &config);
