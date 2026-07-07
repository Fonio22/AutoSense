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

struct ObdLogExportStats
{
    uint32_t recordSize{0};
    uint32_t recordCount{0};
    uint32_t firstSequence{0};
    uint32_t lastSequence{0};
};

class ObdBinaryLogger
{
public:
    static constexpr uint32_t kRecordSize = 24;

    bool begin();
    void configure(bool enabled, uint32_t intervalSeconds);
    void tick(uint32_t nowMs, const ObdCompactSample &sample);

    const ObdLogStats &stats() const;
    bool describeExportRange(uint32_t afterSequence, uint32_t untilSequence, ObdLogExportStats *out) const;
    uint32_t readExportChunk(uint32_t afterSequence,
                             uint32_t untilSequence,
                             uint32_t startSlot,
                             uint32_t maxRecords,
                             uint8_t *out,
                             uint32_t outSize,
                             uint32_t *nextSlot,
                             bool *done,
                             uint32_t *firstSequence,
                             uint32_t *lastSequence) const;

private:
    static constexpr uint32_t kSectorSize = 4096;
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
