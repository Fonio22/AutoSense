#pragma once

#include <stddef.h>
#include <stdint.h>

#ifndef ANOMALY_ENABLE_IFOREST
#define ANOMALY_ENABLE_IFOREST 1
#endif

#ifndef ANOMALY_TRAIN_ON_DEVICE
#define ANOMALY_TRAIN_ON_DEVICE 1
#endif

#ifndef ANOMALY_FEATURE_COUNT
#define ANOMALY_FEATURE_COUNT 11
#endif

constexpr uint8_t kTinyIForestTrees = 16;
constexpr uint8_t kTinyIForestSampleSize = 64;
constexpr uint8_t kTinyIForestRingSize = 128;
constexpr uint8_t kTinyIForestMaxDepth = 6;
constexpr uint8_t kTinyIForestMaxNodes = (1U << (kTinyIForestMaxDepth + 1U)) - 1U;
constexpr uint16_t kTinyIForestStateVersion = 2;

struct TinyIForestNode
{
    int16_t threshold{0};
    int8_t left{-1};
    int8_t right{-1};
    uint8_t feature{0};
    uint8_t size{0};
};

struct TinyIForestState
{
    uint32_t magic{0x41534946UL}; // ASIF
    uint16_t version{1};
    uint16_t featureMask{0};
    uint16_t trainedTrees{0};
    uint16_t sampleCount{0};
    uint16_t nodeCount[kTinyIForestTrees]{};
    TinyIForestNode nodes[kTinyIForestTrees][kTinyIForestMaxNodes]{};
};

class TinyIsolationForest
{
public:
    void reset(uint16_t featureMask);
    bool ready() const;
    uint16_t featureMask() const;
    uint16_t sampleCount() const;
    void addTrainingSample(const int16_t features[ANOMALY_FEATURE_COUNT], uint16_t validMask);
    bool trainStep();
    float score(const int16_t features[ANOMALY_FEATURE_COUNT], uint16_t validMask) const;
    const TinyIForestState &state() const;
    TinyIForestState &stateForLoad();
    bool validateState() const;
    bool loadState(const TinyIForestState &state);

private:
    static float averagePathLength(float size);
    uint32_t nextRand();
    uint8_t pickFeature(uint16_t mask);
    int16_t pickThreshold(int16_t minValue, int16_t maxValue);
    int16_t buildNode(uint8_t tree, uint8_t *indices, uint8_t count, uint8_t depth);
    bool trainTree(uint8_t tree);
    float pathLength(uint8_t tree, const int16_t features[ANOMALY_FEATURE_COUNT]) const;

    TinyIForestState state_{};
    int16_t ring_[kTinyIForestRingSize][ANOMALY_FEATURE_COUNT]{};
    uint16_t ringMask_[kTinyIForestRingSize]{};
    uint8_t ringPos_{0};
    uint8_t ringCount_{0};
    uint8_t trainTree_{0};
    uint16_t newSamples_{0};
    uint32_t seed_{0xA5105EEDUL};
};
