#pragma once

#include <Arduino.h>

enum class ObdCommandFamily : uint8_t
{
    StandardObd = 0,
    Uds = 1,
    IsoTpFlowControl = 2,
};

struct ObdGuardRequest
{
    ObdCommandFamily family{ObdCommandFamily::StandardObd};
    uint8_t service{0};
    uint8_t pidOrSubFunction{0};
    uint32_t canId{0};
    bool extended{false};
};

struct ObdGuardDecision
{
    bool allowed{false};
    const char *reason{nullptr};
};

class ObdReadOnlyGuard
{
public:
    static ObdGuardDecision check(const ObdGuardRequest &request);
    static void printPolicy(Stream &out);

private:
    static bool isSafeStandardObd(uint8_t service);
    static bool isBlockedStandardObd(uint8_t service);
    static bool isSafeUds(uint8_t service);
    static bool isBlockedUds(uint8_t service);
};
