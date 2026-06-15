#include "app_config.h"

#include <LittleFS.h>
#include <stdlib.h>
#include <string.h>

namespace
{
constexpr const char *kConfigPath = "/config.ini";
constexpr const char *kConfigPartitionLabel = "configfs";

char *trim(char *value)
{
    while (*value == ' ' || *value == '\t' || *value == '\r' || *value == '\n')
    {
        value++;
    }

    char *end = value + strlen(value);
    while (end > value)
    {
        char c = *(end - 1);
        if (c != ' ' && c != '\t' && c != '\r' && c != '\n')
        {
            break;
        }
        *(--end) = '\0';
    }

    return value;
}

bool parseBool(const char *value, bool fallback)
{
    if (!value)
    {
        return fallback;
    }

    if (strcasecmp(value, "true") == 0 || strcmp(value, "1") == 0 ||
        strcasecmp(value, "yes") == 0 || strcasecmp(value, "on") == 0)
    {
        return true;
    }

    if (strcasecmp(value, "false") == 0 || strcmp(value, "0") == 0 ||
        strcasecmp(value, "no") == 0 || strcasecmp(value, "off") == 0)
    {
        return false;
    }

    return fallback;
}

uint32_t parseU32(const char *value, uint32_t fallback, uint32_t minValue, uint32_t maxValue)
{
    if (!value || *value == '\0')
    {
        return fallback;
    }

    char *end = nullptr;
    unsigned long parsed = strtoul(value, &end, 10);
    if (end == value)
    {
        return fallback;
    }

    if (parsed < minValue)
    {
        return minValue;
    }
    if (parsed > maxValue)
    {
        return maxValue;
    }
    return static_cast<uint32_t>(parsed);
}

void applySetting(AppRuntimeConfig &config, const char *section, const char *key, const char *value)
{
    if (strcmp(section, "logging") == 0)
    {
        if (strcmp(key, "enabled") == 0)
        {
            config.loggingEnabled = parseBool(value, config.loggingEnabled);
        }
        else if (strcmp(key, "interval_seconds") == 0)
        {
            config.loggingIntervalSeconds = parseU32(value, config.loggingIntervalSeconds, 1, 86400);
        }
        else if (strcmp(key, "max_sample_age_seconds") == 0)
        {
            config.loggingMaxSampleAgeSeconds = parseU32(value, config.loggingMaxSampleAgeSeconds, 1, 3600);
        }
    }
    else if (strcmp(section, "dashboard") == 0)
    {
        if (strcmp(key, "enabled") == 0)
        {
            config.dashboardEnabled = parseBool(value, config.dashboardEnabled);
        }
        else if (strcmp(key, "ebook_mode") == 0)
        {
            config.dashboardEbookMode = parseBool(value, config.dashboardEbookMode);
        }
        else if (strcmp(key, "interval_ms") == 0)
        {
            config.dashboardIntervalMs = parseU32(value, config.dashboardIntervalMs, 50, 10000);
        }
    }
}
} // namespace

bool loadAppRuntimeConfig(AppRuntimeConfig &config)
{
    if (!LittleFS.begin(false, "/littlefs", 4, kConfigPartitionLabel))
    {
        return false;
    }

    File file = LittleFS.open(kConfigPath, "r");
    if (!file)
    {
        return false;
    }

    char section[24] = "";
    char line[128];
    while (file.available())
    {
        size_t len = file.readBytesUntil('\n', line, sizeof(line) - 1);
        line[len] = '\0';

        char *text = trim(line);
        if (*text == '\0' || *text == '#' || *text == ';')
        {
            continue;
        }

        size_t textLen = strlen(text);
        if (textLen >= 3 && text[0] == '[' && text[textLen - 1] == ']')
        {
            text[textLen - 1] = '\0';
            snprintf(section, sizeof(section), "%s", trim(text + 1));
            continue;
        }

        char *eq = strchr(text, '=');
        if (!eq)
        {
            continue;
        }

        *eq = '\0';
        char *key = trim(text);
        char *value = trim(eq + 1);
        applySetting(config, section, key, value);
    }

    file.close();
    return true;
}
