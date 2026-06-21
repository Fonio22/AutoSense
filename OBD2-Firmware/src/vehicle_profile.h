#pragma once

#include <Arduino.h>

#include "obd_service.h"

class ProfileManager
{
public:
    static constexpr size_t kMaxProfileBytes = 16 * 1024;
    static constexpr size_t kSha256HexLen = 64;

    bool begin();
    bool hasActiveProfile() const;
    const ObdRuntimeProfile &activeProfile() const;
    const char *activeProfileId() const;
    const char *activeProfileVersion() const;
    const char *activeProfileHash() const;
    bool extendedReadOnlyEnabled() const;

    bool validateProfileText(const char *text,
                             size_t len,
                             const char *expectedSha256,
                             ObdRuntimeProfile *runtimeOut,
                             char *error,
                             size_t errorSize) const;
    bool saveAndActivateProfile(const char *text,
                                size_t len,
                                const char *expectedSha256,
                                char *error,
                                size_t errorSize);

private:
    bool loadActiveProfile();
    static bool sha256Hex(const char *text, size_t len, char out[kSha256HexLen + 1]);
    static bool parseHexByte(const char *text, uint8_t *out);
    static bool isFormulaAllowed(const char *formulaId);
    static bool isSafeObdMode(const char *mode);
    static bool isSafeUdsService(const char *service);
    static void setError(char *error, size_t errorSize, const char *message);

    ObdRuntimeProfile activeProfile_{};
    bool hasActiveProfile_{false};
    char activeSha256_[kSha256HexLen + 1]{0};
};
