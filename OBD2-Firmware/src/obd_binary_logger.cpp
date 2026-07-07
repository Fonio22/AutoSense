#include "obd_binary_logger.h"

#include <esp_partition.h>
#include <stdlib.h>
#include <string.h>

namespace
{
constexpr const char *kLogPartitionLabel = "obdlog";
constexpr uint8_t kRecordMagic0 = 'A';
constexpr uint8_t kRecordMagic1 = 'S';
constexpr uint8_t kRecordVersion = 1;
constexpr uint32_t kLogRecordSize = 24;

struct __attribute__((packed)) ObdLogRecordV1
{
    uint8_t magic[2];
    uint8_t version;
    uint16_t validMask;
    uint32_t sequence;
    uint32_t uptimeSeconds;
    uint16_t rpm;
    uint8_t speedKph;
    uint8_t coolantRaw;
    uint8_t throttlePct;
    uint8_t fuelLevelPct;
    uint8_t engineLoadPct;
    uint8_t mapKpa;
    uint8_t mafGps;
    uint8_t ecuVoltageDecivolts;
    uint8_t crc8;
};

static_assert(sizeof(ObdLogRecordV1) == 24, "OBD log record must stay 24 bytes");

uint8_t crc8(const uint8_t *data, size_t len)
{
    uint8_t crc = 0;
    for (size_t i = 0; i < len; i++)
    {
        crc ^= data[i];
        for (uint8_t bit = 0; bit < 8; bit++)
        {
            crc = (crc & 0x80) ? static_cast<uint8_t>((crc << 1) ^ 0x07) : static_cast<uint8_t>(crc << 1);
        }
    }
    return crc;
}

uint8_t clampU8(uint32_t value)
{
    return value > 255 ? 255 : static_cast<uint8_t>(value);
}

uint8_t encodeCoolant(int16_t celsius)
{
    int16_t raw = celsius + 40;
    if (raw < 0)
    {
        return 0;
    }
    if (raw > 255)
    {
        return 255;
    }
    return static_cast<uint8_t>(raw);
}

bool recordLooksErased(const uint8_t *record)
{
    for (uint8_t i = 0; i < kLogRecordSize; i++)
    {
        if (record[i] != 0xFF)
        {
            return false;
        }
    }
    return true;
}

bool decodeRecordHeader(const uint8_t *record, uint32_t *sequence)
{
    if (recordLooksErased(record))
    {
        return false;
    }

    const ObdLogRecordV1 *decoded = reinterpret_cast<const ObdLogRecordV1 *>(record);
    if (decoded->magic[0] != kRecordMagic0 || decoded->magic[1] != kRecordMagic1 || decoded->version != kRecordVersion)
    {
        return false;
    }

    if (crc8(record, kLogRecordSize - 1) != decoded->crc8)
    {
        return false;
    }

    if (sequence)
    {
        *sequence = decoded->sequence;
    }
    return true;
}
} // namespace

bool ObdBinaryLogger::begin()
{
    const esp_partition_t *partition = esp_partition_find_first(
        ESP_PARTITION_TYPE_DATA,
        static_cast<esp_partition_subtype_t>(0x40),
        kLogPartitionLabel);

    partition_ = partition;
    stats_.ready = partition != nullptr;
    if (!partition)
    {
        return false;
    }

    sectorCount_ = partition->size / kSectorSize;
    stats_.capacityRecords = sectorCount_ * kRecordsPerSector;
    scanExistingRecords();
    return true;
}

void ObdBinaryLogger::configure(bool enabled, uint32_t intervalSeconds)
{
    stats_.enabled = enabled;
    stats_.intervalSeconds = intervalSeconds == 0 ? 1 : intervalSeconds;
}

void ObdBinaryLogger::tick(uint32_t nowMs, const ObdCompactSample &sample)
{
    if (!stats_.ready || !stats_.enabled || sample.validMask == 0)
    {
        return;
    }

    uint32_t intervalMs = stats_.intervalSeconds * 1000UL;
    if (lastAttemptMs_ != 0 && (nowMs - lastAttemptMs_) < intervalMs)
    {
        return;
    }

    lastAttemptMs_ = nowMs;
    appendRecord(nowMs, sample);
}

const ObdLogStats &ObdBinaryLogger::stats() const
{
    return stats_;
}

bool ObdBinaryLogger::describeExportRange(uint32_t afterSequence, uint32_t untilSequence, ObdLogExportStats *out) const
{
    if (!out)
    {
        return false;
    }

    *out = {};
    out->recordSize = kRecordSize;
    const esp_partition_t *partition = static_cast<const esp_partition_t *>(partition_);
    if (!partition || stats_.capacityRecords == 0)
    {
        return false;
    }

    uint8_t *sector = static_cast<uint8_t *>(malloc(kSectorSize));
    if (!sector)
    {
        return false;
    }

    for (uint32_t sectorIndex = 0; sectorIndex < sectorCount_; sectorIndex++)
    {
        if (esp_partition_read(partition, sectorIndex * kSectorSize, sector, kSectorSize) != ESP_OK)
        {
            continue;
        }

        for (uint32_t recordIndex = 0; recordIndex < kRecordsPerSector; recordIndex++)
        {
            uint32_t sequence = 0;
            const uint8_t *record = sector + (recordIndex * kRecordSize);
            if (!decodeRecordHeader(record, &sequence) || sequence <= afterSequence || sequence > untilSequence)
            {
                continue;
            }

            out->recordCount++;
            if (out->firstSequence == 0 || sequence < out->firstSequence)
            {
                out->firstSequence = sequence;
            }
            if (sequence > out->lastSequence)
            {
                out->lastSequence = sequence;
            }
        }
    }

    free(sector);
    return true;
}

uint32_t ObdBinaryLogger::readExportChunk(uint32_t afterSequence,
                                          uint32_t untilSequence,
                                          uint32_t startSlot,
                                          uint32_t maxRecords,
                                          uint8_t *out,
                                          uint32_t outSize,
                                          uint32_t *nextSlot,
                                          bool *done,
                                          uint32_t *firstSequence,
                                          uint32_t *lastSequence) const
{
    const esp_partition_t *partition = static_cast<const esp_partition_t *>(partition_);
    if (nextSlot)
    {
        *nextSlot = startSlot;
    }
    if (done)
    {
        *done = true;
    }
    if (firstSequence)
    {
        *firstSequence = 0;
    }
    if (lastSequence)
    {
        *lastSequence = 0;
    }
    if (!partition || !out || maxRecords == 0 || outSize < kRecordSize || stats_.capacityRecords == 0)
    {
        return 0;
    }

    const uint32_t capacityRecords = stats_.capacityRecords;
    uint32_t slot = startSlot >= capacityRecords ? capacityRecords : startSlot;
    uint32_t written = 0;
    uint8_t record[kRecordSize]{0};

    while (slot < capacityRecords && written < maxRecords && ((written + 1) * kRecordSize) <= outSize)
    {
        const uint32_t sectorIndex = slot / kRecordsPerSector;
        const uint32_t recordIndex = slot % kRecordsPerSector;
        const uint32_t offset = (sectorIndex * kSectorSize) + (recordIndex * kRecordSize);
        slot++;

        if (esp_partition_read(partition, offset, record, sizeof(record)) != ESP_OK)
        {
            continue;
        }

        uint32_t sequence = 0;
        if (!decodeRecordHeader(record, &sequence) || sequence <= afterSequence || sequence > untilSequence)
        {
            continue;
        }

        memcpy(out + (written * kRecordSize), record, kRecordSize);
        written++;
        if (firstSequence && (*firstSequence == 0 || sequence < *firstSequence))
        {
            *firstSequence = sequence;
        }
        if (lastSequence && sequence > *lastSequence)
        {
            *lastSequence = sequence;
        }
    }

    if (nextSlot)
    {
        *nextSlot = slot;
    }
    if (done)
    {
        *done = slot >= capacityRecords;
    }
    return written;
}

void ObdBinaryLogger::scanExistingRecords()
{
    const esp_partition_t *partition = static_cast<const esp_partition_t *>(partition_);
    if (!partition || stats_.capacityRecords == 0)
    {
        return;
    }

    uint8_t *sector = static_cast<uint8_t *>(malloc(kSectorSize));
    if (!sector)
    {
        stats_.ready = false;
        return;
    }

    uint32_t bestSequence = 0;
    uint32_t bestSlot = 0;
    uint32_t validCount = 0;

    for (uint32_t sectorIndex = 0; sectorIndex < sectorCount_; sectorIndex++)
    {
        if (esp_partition_read(partition, sectorIndex * kSectorSize, sector, kSectorSize) != ESP_OK)
        {
            continue;
        }

        for (uint32_t recordIndex = 0; recordIndex < kRecordsPerSector; recordIndex++)
        {
            uint32_t sequence = 0;
            const uint8_t *record = sector + (recordIndex * kRecordSize);
            if (!decodeRecordHeader(record, &sequence))
            {
                continue;
            }

            uint32_t slot = (sectorIndex * kRecordsPerSector) + recordIndex;
            validCount++;
            if (sequence > bestSequence)
            {
                bestSequence = sequence;
                bestSlot = slot;
            }
        }
    }

    free(sector);

    stats_.recordsWritten = validCount;
    stats_.lastSequence = bestSequence;
    nextSequence_ = bestSequence == 0 ? 1 : bestSequence + 1;
    nextSlot_ = bestSequence == 0 ? 0 : ((bestSlot + 1) % stats_.capacityRecords);
}

bool ObdBinaryLogger::eraseSectorForSlot(uint32_t slot)
{
    const esp_partition_t *partition = static_cast<const esp_partition_t *>(partition_);
    uint32_t sectorIndex = slot / kRecordsPerSector;
    esp_err_t err = esp_partition_erase_range(partition, sectorIndex * kSectorSize, kSectorSize);
    if (err != ESP_OK)
    {
        stats_.eraseErrors++;
        return false;
    }
    return true;
}

bool ObdBinaryLogger::appendRecord(uint32_t nowMs, const ObdCompactSample &sample)
{
    const esp_partition_t *partition = static_cast<const esp_partition_t *>(partition_);
    if (!partition || stats_.capacityRecords == 0)
    {
        return false;
    }

    if ((nextSlot_ % kRecordsPerSector) == 0 && !eraseSectorForSlot(nextSlot_))
    {
        return false;
    }

    ObdLogRecordV1 record{};
    record.magic[0] = kRecordMagic0;
    record.magic[1] = kRecordMagic1;
    record.version = kRecordVersion;
    record.validMask = sample.validMask;
    record.sequence = nextSequence_;
    record.uptimeSeconds = nowMs / 1000UL;
    record.rpm = sample.rpm;
    record.speedKph = sample.speedKph;
    record.coolantRaw = encodeCoolant(sample.coolantC);
    record.throttlePct = clampU8(sample.throttlePct);
    record.fuelLevelPct = clampU8(sample.fuelLevelPct);
    record.engineLoadPct = clampU8(sample.engineLoadPct);
    record.mapKpa = sample.mapKpa;
    record.mafGps = clampU8((sample.mafCentiGps + 50U) / 100U);
    record.ecuVoltageDecivolts = clampU8((sample.ecuMv + 50U) / 100U);
    record.crc8 = crc8(reinterpret_cast<const uint8_t *>(&record), sizeof(record) - 1);

    uint32_t sectorIndex = nextSlot_ / kRecordsPerSector;
    uint32_t recordIndex = nextSlot_ % kRecordsPerSector;
    uint32_t offset = (sectorIndex * kSectorSize) + (recordIndex * kRecordSize);
    esp_err_t err = esp_partition_write(partition, offset, &record, sizeof(record));
    if (err != ESP_OK)
    {
        stats_.writeErrors++;
        return false;
    }

    stats_.lastWriteMs = nowMs;
    stats_.lastSequence = nextSequence_;
    if (stats_.recordsWritten < stats_.capacityRecords)
    {
        stats_.recordsWritten++;
    }

    nextSequence_++;
    nextSlot_ = (nextSlot_ + 1) % stats_.capacityRecords;
    return true;
}
