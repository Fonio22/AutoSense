#include "vehicle_profile.h"

#include <ArduinoJson.h>
#include <LittleFS.h>
#include <Preferences.h>
#include <ctype.h>
#include <mbedtls/sha256.h>
#include <stdio.h>
#include <string.h>

namespace
{
constexpr const char *kConfigPartitionLabel = "configfs";
constexpr const char *kActiveProfilePath = "/active_profile.json";
constexpr const char *kProfilePrefs = "obd_profile";
constexpr const char *kPrefsProfileId = "profile_id";
constexpr const char *kPrefsVersion = "version";
constexpr const char *kPrefsSha256 = "sha256";

bool isTruthy(JsonVariantConst value, bool fallback)
{
    if (value.isNull())
    {
        return fallback;
    }
    return value.as<bool>();
}

uint16_t boundedPollMs(JsonVariantConst value)
{
    uint32_t pollMs = value | 1000;
    if (pollMs < 100)
    {
        pollMs = 100;
    }
    if (pollMs > 60000)
    {
        pollMs = 60000;
    }
    return (uint16_t)pollMs;
}
} // namespace

bool ProfileManager::begin()
{
    if (!LittleFS.begin(false, "/littlefs", 4, kConfigPartitionLabel))
    {
        return false;
    }
    return loadActiveProfile();
}

bool ProfileManager::hasActiveProfile() const
{
    return hasActiveProfile_;
}

const ObdRuntimeProfile &ProfileManager::activeProfile() const
{
    return activeProfile_;
}

const char *ProfileManager::activeProfileId() const
{
    return hasActiveProfile_ ? activeProfile_.profileId : "";
}

const char *ProfileManager::activeProfileVersion() const
{
    return hasActiveProfile_ ? activeProfile_.version : "";
}

const char *ProfileManager::activeProfileHash() const
{
    return hasActiveProfile_ ? activeSha256_ : "";
}

bool ProfileManager::extendedReadOnlyEnabled() const
{
    return hasActiveProfile_ && activeProfile_.extendedReadOnly;
}

bool ProfileManager::sha256Hex(const char *text, size_t len, char out[kSha256HexLen + 1])
{
    if (!text || !out)
    {
        return false;
    }

    uint8_t hash[32];
    mbedtls_sha256((const unsigned char *)text, len, hash, 0);
    for (uint8_t i = 0; i < sizeof(hash); i++)
    {
        snprintf(out + (i * 2), 3, "%02x", hash[i]);
    }
    out[kSha256HexLen] = '\0';
    return true;
}

bool ProfileManager::parseHexByte(const char *text, uint8_t *out)
{
    if (!text || !out)
    {
        return false;
    }

    while (*text == ' ' || *text == '\t')
    {
        text++;
    }
    if (text[0] == '0' && (text[1] == 'x' || text[1] == 'X'))
    {
        text += 2;
    }

    char *end = nullptr;
    unsigned long parsed = strtoul(text, &end, 16);
    if (end == text || parsed > 0xFF)
    {
        return false;
    }
    *out = (uint8_t)parsed;
    return true;
}

bool ProfileManager::isFormulaAllowed(const char *formulaId)
{
    if (!formulaId)
    {
        return false;
    }

    static const char *kAllowed[] = {
        "be16",
        "be16_div_4",
        "be16_div_100",
        "be16_div_1000",
        "be16_mul_0_05",
        "identity_a",
        "pct_a_255",
        "spark_adv_a_half_minus_64",
        "temp_a_minus_40",
        "trim_a_128",
    };

    for (const char *allowed : kAllowed)
    {
        if (strcmp(formulaId, allowed) == 0)
        {
            return true;
        }
    }
    return false;
}

bool ProfileManager::isSafeObdMode(const char *mode)
{
    uint8_t parsed = 0;
    if (!parseHexByte(mode, &parsed))
    {
        return false;
    }
    return parsed == 0x01 || parsed == 0x09;
}

bool ProfileManager::isSafeUdsService(const char *service)
{
    uint8_t parsed = 0;
    if (!parseHexByte(service, &parsed))
    {
        return false;
    }
    return parsed == 0x19 || parsed == 0x22;
}

void ProfileManager::setError(char *error, size_t errorSize, const char *message)
{
    if (error && errorSize > 0)
    {
        snprintf(error, errorSize, "%s", message ? message : "profile_error");
    }
}

bool ProfileManager::validateProfileText(const char *text,
                                         size_t len,
                                         const char *expectedSha256,
                                         ObdRuntimeProfile *runtimeOut,
                                         char *error,
                                         size_t errorSize) const
{
    if (!text || len == 0)
    {
        setError(error, errorSize, "empty_profile");
        return false;
    }
    if (len > kMaxProfileBytes)
    {
        setError(error, errorSize, "profile_too_large");
        return false;
    }

    char actualSha[kSha256HexLen + 1]{0};
    if (expectedSha256 && expectedSha256[0] != '\0')
    {
        if (!sha256Hex(text, len, actualSha) || strcasecmp(actualSha, expectedSha256) != 0)
        {
            setError(error, errorSize, "profile_hash_mismatch");
            return false;
        }
    }

    JsonDocument doc;
    DeserializationError parseError = deserializeJson(doc, text, len);
    if (parseError)
    {
        setError(error, errorSize, "profile_json_invalid");
        return false;
    }

    if ((doc["schemaVersion"] | 0) != 1)
    {
        setError(error, errorSize, "schema_unsupported");
        return false;
    }

    const char *profileId = doc["profileId"] | "";
    const char *version = doc["version"] | "";
    if (profileId[0] == '\0' || version[0] == '\0')
    {
        setError(error, errorSize, "profile_identity_missing");
        return false;
    }

    const char *bus = doc["protocol"]["bus"] | "";
    if (strcmp(bus, "CAN") != 0)
    {
        setError(error, errorSize, "protocol_not_supported");
        return false;
    }

    JsonArrayConst signals = doc["signals"].as<JsonArrayConst>();
    if (signals.isNull() || signals.size() == 0)
    {
        setError(error, errorSize, "signals_missing");
        return false;
    }

    ObdRuntimeProfile runtime{};
    snprintf(runtime.profileId, sizeof(runtime.profileId), "%s", profileId);
    snprintf(runtime.version, sizeof(runtime.version), "%s", version);

    for (JsonObjectConst signal : signals)
    {
        const char *mode = signal["mode"] | "";
        const char *pidText = signal["pid"] | "";
        const char *formulaId = signal["formulaId"] | "";

        if (!isSafeObdMode(mode))
        {
            setError(error, errorSize, "obd_mode_blocked");
            return false;
        }
        if (!isFormulaAllowed(formulaId))
        {
            setError(error, errorSize, "formula_not_allowed");
            return false;
        }

        uint8_t modeByte = 0;
        uint8_t pid = 0;
        if (!parseHexByte(mode, &modeByte) || !parseHexByte(pidText, &pid))
        {
            setError(error, errorSize, "pid_invalid");
            return false;
        }

        if (modeByte != 0x01)
        {
            continue;
        }

        if (runtime.signalCount >= ObdRuntimeProfile::kMaxSignals)
        {
            setError(error, errorSize, "too_many_signals");
            return false;
        }

        ObdProfileSignalConfig &target = runtime.signals[runtime.signalCount++];
        target.pid = pid;
        target.pollMs = boundedPollMs(signal["pollMs"]);
        target.required = isTruthy(signal["required"], false);
        target.enabled = isTruthy(signal["enabledByDefault"], true);
    }

    JsonArrayConst services = doc["extendedReadOnly"]["udsServices"].as<JsonArrayConst>();
    for (JsonVariantConst service : services)
    {
        const char *serviceText = service | "";
        if (!isSafeUdsService(serviceText))
        {
            setError(error, errorSize, "uds_service_blocked");
            return false;
        }
        runtime.extendedReadOnly = true;
    }

    if (runtime.signalCount == 0)
    {
        setError(error, errorSize, "runtime_signals_missing");
        return false;
    }

    if (runtimeOut)
    {
        *runtimeOut = runtime;
    }
    setError(error, errorSize, "");
    return true;
}

bool ProfileManager::saveAndActivateProfile(const char *text,
                                            size_t len,
                                            const char *expectedSha256,
                                            char *error,
                                            size_t errorSize)
{
    ObdRuntimeProfile runtime{};
    if (!validateProfileText(text, len, expectedSha256, &runtime, error, errorSize))
    {
        return false;
    }

    File file = LittleFS.open(kActiveProfilePath, "w");
    if (!file)
    {
        setError(error, errorSize, "profile_write_failed");
        return false;
    }

    size_t written = file.write((const uint8_t *)text, len);
    file.close();
    if (written != len)
    {
        setError(error, errorSize, "profile_write_incomplete");
        return false;
    }

    char actualSha[kSha256HexLen + 1]{0};
    sha256Hex(text, len, actualSha);

    Preferences prefs;
    if (prefs.begin(kProfilePrefs, false))
    {
        prefs.putString(kPrefsProfileId, runtime.profileId);
        prefs.putString(kPrefsVersion, runtime.version);
        prefs.putString(kPrefsSha256, actualSha);
        prefs.end();
    }

    activeProfile_ = runtime;
    snprintf(activeSha256_, sizeof(activeSha256_), "%s", actualSha);
    hasActiveProfile_ = true;
    return true;
}

bool ProfileManager::loadActiveProfile()
{
    File file = LittleFS.open(kActiveProfilePath, "r");
    if (!file)
    {
        return false;
    }

    size_t size = file.size();
    if (size == 0 || size > kMaxProfileBytes)
    {
        file.close();
        return false;
    }

    char *buffer = new char[size + 1];
    if (!buffer)
    {
        file.close();
        return false;
    }

    size_t read = file.readBytes(buffer, size);
    file.close();
    buffer[read] = '\0';

    Preferences prefs;
    char expectedSha[kSha256HexLen + 1]{0};
    if (prefs.begin(kProfilePrefs, true))
    {
        String stored = prefs.getString(kPrefsSha256, "");
        snprintf(expectedSha, sizeof(expectedSha), "%s", stored.c_str());
        prefs.end();
    }

    char error[40]{0};
    ObdRuntimeProfile runtime{};
    bool ok = validateProfileText(buffer,
                                  read,
                                  expectedSha[0] ? expectedSha : nullptr,
                                  &runtime,
                                  error,
                                  sizeof(error));
    if (ok)
    {
        activeProfile_ = runtime;
        sha256Hex(buffer, read, activeSha256_);
        hasActiveProfile_ = true;
    }

    delete[] buffer;
    return ok;
}
