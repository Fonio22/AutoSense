#pragma once

#include <Arduino.h>

struct AppRuntimeConfig
{
    bool loggingEnabled{true};
    uint32_t loggingIntervalSeconds{10};
    uint32_t loggingMaxSampleAgeSeconds{15};
    bool dashboardEnabled{true};
    uint32_t dashboardIntervalMs{200};
    uint32_t serialDiagIntervalMs{2000};
};

bool loadAppRuntimeConfig(AppRuntimeConfig &config);
