#include "tiny_isolation_forest.h"

#include <math.h>
#include <string.h>

namespace
{
constexpr float kEulerGamma = 0.5772156649f;

uint8_t popcount16(uint16_t value)
{
    uint8_t count = 0;
    while (value)
    {
        count += value & 1U;
        value >>= 1U;
    }
    return count;
}

void swapU8(uint8_t &a, uint8_t &b)
{
    uint8_t tmp = a;
    a = b;
    b = tmp;
}
} // namespace

void TinyIsolationForest::reset(uint16_t featureMask)
{
    memset(&state_, 0, sizeof(state_));
    state_.magic = 0x41534946UL;
    state_.version = kTinyIForestStateVersion;
    state_.featureMask = featureMask;
    ringPos_ = 0;
    ringCount_ = 0;
    trainTree_ = 0;
    newSamples_ = 0;
    seed_ = 0xA5105EEDUL ^ ((uint32_t)featureMask << 8);
}

bool TinyIsolationForest::ready() const
{
#if ANOMALY_ENABLE_IFOREST
    return state_.trainedTrees == kTinyIForestTrees && state_.featureMask != 0;
#else
    return false;
#endif
}

uint16_t TinyIsolationForest::featureMask() const
{
    return state_.featureMask;
}

uint16_t TinyIsolationForest::sampleCount() const
{
    return state_.sampleCount;
}

void TinyIsolationForest::addTrainingSample(const int16_t features[ANOMALY_FEATURE_COUNT], uint16_t validMask)
{
#if ANOMALY_ENABLE_IFOREST && ANOMALY_TRAIN_ON_DEVICE
    uint16_t mask = validMask & state_.featureMask;
    if (popcount16(mask) < 3)
    {
        return;
    }

    for (uint8_t i = 0; i < ANOMALY_FEATURE_COUNT; i++)
    {
        ring_[ringPos_][i] = (mask & (1U << i)) ? features[i] : 0;
    }
    ringMask_[ringPos_] = mask;
    ringPos_ = (ringPos_ + 1U) % kTinyIForestRingSize;
    if (ringCount_ < kTinyIForestRingSize)
    {
        ringCount_++;
    }
    state_.sampleCount++;
    newSamples_++;
#else
    (void)features;
    (void)validMask;
#endif
}

bool TinyIsolationForest::trainStep()
{
#if ANOMALY_ENABLE_IFOREST && ANOMALY_TRAIN_ON_DEVICE
    if (ringCount_ < kTinyIForestSampleSize || state_.featureMask == 0)
    {
        return false;
    }
    if (ready() && newSamples_ < kTinyIForestSampleSize)
    {
        return false;
    }

    if (trainTree_ == 0)
    {
        state_.trainedTrees = 0;
    }

    bool ok = trainTree(trainTree_);
    if (ok)
    {
        trainTree_++;
        state_.trainedTrees = trainTree_;
        if (trainTree_ >= kTinyIForestTrees)
        {
            trainTree_ = 0;
            newSamples_ = 0;
        }
    }
    return ok;
#else
    return false;
#endif
}

float TinyIsolationForest::score(const int16_t features[ANOMALY_FEATURE_COUNT], uint16_t validMask) const
{
#if ANOMALY_ENABLE_IFOREST
    if (!ready() || popcount16(validMask & state_.featureMask) < 3)
    {
        return 0.0f;
    }

    float total = 0.0f;
    for (uint8_t tree = 0; tree < kTinyIForestTrees; tree++)
    {
        total += pathLength(tree, features);
    }

    float avg = total / (float)kTinyIForestTrees;
    float normalizer = averagePathLength((float)kTinyIForestSampleSize);
    if (normalizer <= 0.001f)
    {
        return 0.0f;
    }
    float raw = exp2f(-avg / normalizer);
    if (raw < 0.0f)
    {
        raw = 0.0f;
    }
    if (raw > 1.0f)
    {
        raw = 1.0f;
    }
    return raw * 100.0f;
#else
    (void)features;
    (void)validMask;
    return 0.0f;
#endif
}

const TinyIForestState &TinyIsolationForest::state() const
{
    return state_;
}

TinyIForestState &TinyIsolationForest::stateForLoad()
{
    return state_;
}

bool TinyIsolationForest::validateState() const
{
    if (state_.magic != 0x41534946UL || state_.version != kTinyIForestStateVersion || state_.featureMask == 0 ||
        state_.trainedTrees > kTinyIForestTrees)
    {
        return false;
    }
    for (uint8_t i = 0; i < state_.trainedTrees; i++)
    {
        if (state_.nodeCount[i] == 0 || state_.nodeCount[i] > kTinyIForestMaxNodes)
        {
            return false;
        }
    }
    return true;
}

bool TinyIsolationForest::loadState(const TinyIForestState &state)
{
    if (state.magic != 0x41534946UL || state.version != kTinyIForestStateVersion || state.featureMask == 0 ||
        state.trainedTrees > kTinyIForestTrees)
    {
        return false;
    }
    for (uint8_t i = 0; i < state.trainedTrees; i++)
    {
        if (state.nodeCount[i] == 0 || state.nodeCount[i] > kTinyIForestMaxNodes)
        {
            return false;
        }
    }
    state_ = state;
    ringPos_ = 0;
    ringCount_ = 0;
    trainTree_ = 0;
    newSamples_ = 0;
    seed_ = 0xA5105EEDUL ^ ((uint32_t)state_.featureMask << 8);
    return true;
}

float TinyIsolationForest::averagePathLength(float size)
{
    if (size <= 1.0f)
    {
        return 0.0f;
    }
    if (size <= 2.0f)
    {
        return 1.0f;
    }
    return (2.0f * (logf(size - 1.0f) + kEulerGamma)) - (2.0f * (size - 1.0f) / size);
}

uint32_t TinyIsolationForest::nextRand()
{
    seed_ ^= seed_ << 13;
    seed_ ^= seed_ >> 17;
    seed_ ^= seed_ << 5;
    return seed_;
}

uint8_t TinyIsolationForest::pickFeature(uint16_t mask)
{
    uint8_t count = popcount16(mask);
    if (count == 0)
    {
        return 0;
    }
    uint8_t target = nextRand() % count;
    for (uint8_t i = 0; i < ANOMALY_FEATURE_COUNT; i++)
    {
        if (mask & (1U << i))
        {
            if (target == 0)
            {
                return i;
            }
            target--;
        }
    }
    return 0;
}

int16_t TinyIsolationForest::pickThreshold(int16_t minValue, int16_t maxValue)
{
    if (maxValue <= minValue)
    {
        return minValue;
    }
    uint16_t span = (uint16_t)(maxValue - minValue);
    return (int16_t)(minValue + 1 + (int16_t)(nextRand() % span));
}

int16_t TinyIsolationForest::buildNode(uint8_t tree, uint8_t *indices, uint8_t count, uint8_t depth)
{
    uint16_t &nodeCount = state_.nodeCount[tree];
    if (nodeCount >= kTinyIForestMaxNodes)
    {
        return -1;
    }

    int16_t nodeIndex = (int16_t)nodeCount++;
    TinyIForestNode &node = state_.nodes[tree][nodeIndex];
    node.size = count;
    node.left = -1;
    node.right = -1;

    if (count <= 1 || depth >= kTinyIForestMaxDepth)
    {
        return nodeIndex;
    }

    uint8_t feature = 0;
    int16_t minValue = 0;
    int16_t maxValue = 0;
    bool canSplit = false;
    for (uint8_t attempt = 0; attempt < ANOMALY_FEATURE_COUNT; attempt++)
    {
        feature = pickFeature(state_.featureMask);
        minValue = ring_[indices[0]][feature];
        maxValue = minValue;
        for (uint8_t i = 1; i < count; i++)
        {
            int16_t value = ring_[indices[i]][feature];
            if (value < minValue)
            {
                minValue = value;
            }
            if (value > maxValue)
            {
                maxValue = value;
            }
        }
        if (maxValue > minValue)
        {
            canSplit = true;
            break;
        }
    }

    if (!canSplit)
    {
        return nodeIndex;
    }

    int16_t threshold = pickThreshold(minValue, maxValue);
    int leftEnd = 0;
    int rightEnd = (int)count - 1;
    while (leftEnd <= rightEnd)
    {
        if (ring_[indices[leftEnd]][feature] < threshold)
        {
            leftEnd++;
        }
        else
        {
            swapU8(indices[leftEnd], indices[rightEnd]);
            rightEnd--;
        }
    }

    if (leftEnd == 0 || leftEnd == count)
    {
        return nodeIndex;
    }

    node.feature = feature;
    node.threshold = threshold;
    node.left = (int8_t)buildNode(tree, indices, (uint8_t)leftEnd, depth + 1U);
    node.right = (int8_t)buildNode(tree, indices + leftEnd, (uint8_t)(count - leftEnd), depth + 1U);
    if (node.left < 0 || node.right < 0)
    {
        node.left = -1;
        node.right = -1;
    }
    return nodeIndex;
}

bool TinyIsolationForest::trainTree(uint8_t tree)
{
    if (tree >= kTinyIForestTrees)
    {
        return false;
    }

    state_.nodeCount[tree] = 0;
    uint8_t indices[kTinyIForestSampleSize]{};
    for (uint8_t i = 0; i < kTinyIForestSampleSize; i++)
    {
        indices[i] = nextRand() % ringCount_;
    }

    int16_t root = buildNode(tree, indices, kTinyIForestSampleSize, 0);
    return root == 0 && state_.nodeCount[tree] > 0;
}

float TinyIsolationForest::pathLength(uint8_t tree, const int16_t features[ANOMALY_FEATURE_COUNT]) const
{
    if (tree >= state_.trainedTrees || state_.nodeCount[tree] == 0)
    {
        return 0.0f;
    }

    int8_t index = 0;
    for (uint8_t depth = 0; depth < kTinyIForestMaxNodes; depth++)
    {
        const TinyIForestNode &node = state_.nodes[tree][index];
        if (node.left < 0 || node.right < 0)
        {
            return (float)depth + averagePathLength((float)node.size);
        }
        index = features[node.feature] < node.threshold ? node.left : node.right;
        if (index < 0 || index >= state_.nodeCount[tree])
        {
            return (float)depth;
        }
    }
    return (float)kTinyIForestMaxDepth;
}
