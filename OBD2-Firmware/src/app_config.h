#pragma once

#include <Arduino.h>

struct AppRuntimeConfig
{
    bool loggingEnabled{true};
    uint32_t loggingIntervalSeconds{10};
    uint32_t loggingMaxSampleAgeSeconds{15};
    bool dashboardEnabled{true};
    bool dashboardEbookMode{true};
    uint32_t dashboardIntervalMs{1000};
    bool obdDiagnosticInfoEnabled{true};
    bool vagExtendedEnabled{false};
    bool vagForceProfile{false};
};

bool loadAppRuntimeConfig(AppRuntimeConfig &config);
