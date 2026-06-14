#pragma once

#include <Arduino.h>

#include "obd_service.h"

struct ObdLogStats
{
    bool ready{false};
    bool enabled{true};
    uint32_t capacityRecords{0};
    uint32_t recordsWritten{0};
    uint32_t lastSequence{0};
    uint32_t writeErrors{0};
    uint32_t eraseErrors{0};
    uint32_t lastWriteMs{0};
    uint32_t intervalSeconds{10};
};

class ObdBinaryLogger
{
public:
    bool begin();
    void configure(bool enabled, uint32_t intervalSeconds);
    void tick(uint32_t nowMs, const ObdCompactSample &sample);

    const ObdLogStats &stats() const;

private:
    static constexpr uint32_t kSectorSize = 4096;
    static constexpr uint32_t kRecordSize = 24;
    static constexpr uint32_t kRecordsPerSector = 170;

    bool appendRecord(uint32_t nowMs, const ObdCompactSample &sample);
    bool eraseSectorForSlot(uint32_t slot);
    void scanExistingRecords();

    const void *partition_{nullptr};
    uint32_t sectorCount_{0};
    uint32_t nextSlot_{0};
    uint32_t nextSequence_{1};
    uint32_t lastAttemptMs_{0};
    ObdLogStats stats_{};
};
