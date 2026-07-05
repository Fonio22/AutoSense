#include "obd_route_classifier.h"

#include <math.h>
#include <stdio.h>
#include <string.h>

namespace
{
constexpr float kHighwayAvgSpeed = 62.0f;
constexpr float kHighwayHighSpeedPct = 60.0f;
constexpr float kHighwayStopPct = 8.0f;
constexpr float kHighwayBrakePct = 12.0f;
constexpr float kMaxFastAccelPct = 10.0f;
constexpr float kMaxAvgAbsAccel = 4.8f;
constexpr float kCityStrongAvgSpeed = 28.0f;
constexpr float kCityStrongStopPct = 40.0f;
constexpr float kCityStrongBrakePct = 28.0f;
constexpr float kCitySoftAvgSpeed = 45.0f;
constexpr float kCitySoftStopPct = 18.0f;
constexpr float kCitySoftHighSpeedPct = 10.0f;
constexpr float kCitySoftBrakePct = 14.0f;
constexpr float kMinCandidateDistanceKm = 2.0f;
constexpr uint8_t kCityExitEvidenceTicks = 24;

uint8_t clampU8(int value, int minValue, int maxValue)
{
    if (value < minValue)
    {
        return static_cast<uint8_t>(minValue);
    }
    if (value > maxValue)
    {
        return static_cast<uint8_t>(maxValue);
    }
    return static_cast<uint8_t>(value);
}
} // namespace

void ObdRouteClassifier::reset()
{
    memset(speed_, 0, sizeof(speed_));
    memset(accel_, 0, sizeof(accel_));
    count_ = 0;
    next_ = 0;
    lastSpeed_ = 0;
    haveLastSpeed_ = false;
    lastAcceptedMs_ = 0;
    candidateTicks_ = 0;
    cityEvidenceTicks_ = 0;
    candidateDistanceKm_ = 0.0f;
    score_ = -10;
    state_ = ObdRouteState::Unknown;
    setEstimate(ObdRouteState::Unknown, "insufficient_data");
}

const ObdRouteEstimate &ObdRouteClassifier::lastEstimate() const
{
    return estimate_;
}

ObdRouteEstimate ObdRouteClassifier::update(uint32_t nowMs, const ObdRouteInput &input)
{
    if (lastAcceptedMs_ != 0 && (nowMs - lastAcceptedMs_) < kSampleIntervalMs)
    {
        return estimate_;
    }

    if (lastAcceptedMs_ != 0 && (nowMs - lastAcceptedMs_) > kResetGapMs)
    {
        reset();
    }
    lastAcceptedMs_ = nowMs;

    if (!(input.validMask & ROUTE_INPUT_SPEED))
    {
        reset();
        lastAcceptedMs_ = nowMs;
        setEstimate(ObdRouteState::Unknown, "no_speed");
        return estimate_;
    }

    const uint8_t speed = input.speedKph;
    const float accel = haveLastSpeed_ ? static_cast<float>(speed) - static_cast<float>(lastSpeed_) : 0.0f;
    haveLastSpeed_ = true;
    lastSpeed_ = speed;
    pushSample(speed, accel);

    if (count_ < kMinWindowSamples)
    {
        if (speed <= 45)
        {
            state_ = ObdRouteState::City;
            score_ = -10;
            setEstimate(state_, "warming_city");
        }
        else
        {
            setEstimate(ObdRouteState::Unknown, "warming_up");
        }
        return estimate_;
    }

    const WindowStats s = stats();
    const bool stable = s.fastAccelPct <= kMaxFastAccelPct && s.avgAbsAccel <= kMaxAvgAbsAccel;
    const bool highwayEvidence = s.avgSpeed >= kHighwayAvgSpeed &&
                                 s.highSpeedPct >= kHighwayHighSpeedPct &&
                                 s.stopPct <= kHighwayStopPct &&
                                 s.brakePct <= kHighwayBrakePct &&
                                 stable;
    const bool highButUnstable = s.avgSpeed >= kHighwayAvgSpeed && s.highSpeedPct >= kHighwayHighSpeedPct && !stable;
    const bool cityStrong = s.avgSpeed <= kCityStrongAvgSpeed ||
                            s.stopPct >= kCityStrongStopPct ||
                            s.brakePct >= kCityStrongBrakePct;
    const bool citySoft = s.avgSpeed <= kCitySoftAvgSpeed ||
                          s.stopPct >= kCitySoftStopPct ||
                          (s.highSpeedPct <= kCitySoftHighSpeedPct && s.brakePct >= kCitySoftBrakePct);

    if (state_ == ObdRouteState::Highway)
    {
        const bool highwayKeep = s.avgSpeed >= 8.0f && s.stopPct <= 65.0f && !cityStrong;
        if (highwayEvidence || highwayKeep)
        {
            score_ = clampScore(score_ + (highwayEvidence ? 2 : 0));
            cityEvidenceTicks_ = 0;
            setEstimate(state_, highwayEvidence ? "highway_cruise" : "highway_hold");
            return estimate_;
        }

        if (cityStrong || citySoft)
        {
            cityEvidenceTicks_ = clampU8(cityEvidenceTicks_ + 1, 0, 255);
            score_ = clampScore(score_ - (cityStrong ? 3 : 1));
            if (cityEvidenceTicks_ >= kCityExitEvidenceTicks)
            {
                state_ = ObdRouteState::City;
                candidateTicks_ = 0;
                candidateDistanceKm_ = 0.0f;
                setEstimate(state_, "city_sustained");
                return estimate_;
            }
            setEstimate(ObdRouteState::Highway, "possible_exit");
            return estimate_;
        }
    }

    if (highwayEvidence)
    {
        if (state_ != ObdRouteState::HighwayCandidate)
        {
            state_ = ObdRouteState::HighwayCandidate;
            candidateTicks_ = 0;
            candidateDistanceKm_ = 0.0f;
        }
        candidateTicks_ = clampU8(candidateTicks_ + 1, 0, 255);
        candidateDistanceKm_ += static_cast<float>(speed) / 360.0f;
        score_ = clampScore(score_ + 4);
        cityEvidenceTicks_ = 0;

        if (candidateTicks_ >= kConfirmSamples && candidateDistanceKm_ >= kMinCandidateDistanceKm)
        {
            state_ = ObdRouteState::Highway;
            setEstimate(state_, "confirmed_highway");
            return estimate_;
        }

        setEstimate(state_, "candidate");
        return estimate_;
    }

    if (state_ == ObdRouteState::HighwayCandidate)
    {
        if (cityStrong || citySoft)
        {
            score_ = clampScore(score_ - (cityStrong ? 4 : 2));
            if (candidateTicks_ > 0)
            {
                candidateTicks_--;
            }
            if (cityStrong || candidateTicks_ == 0)
            {
                state_ = ObdRouteState::City;
                candidateDistanceKm_ = 0.0f;
                setEstimate(state_, cityStrong ? "candidate_rejected" : "city_pattern");
                return estimate_;
            }
        }
        setEstimate(state_, highButUnstable ? "fast_accel_only" : "candidate_wait");
        return estimate_;
    }

    if (cityStrong || citySoft || !highwayEvidence)
    {
        state_ = ObdRouteState::City;
        candidateTicks_ = 0;
        candidateDistanceKm_ = 0.0f;
        score_ = clampScore(score_ - (cityStrong ? 4 : 2));
        setEstimate(state_, highButUnstable ? "fast_accel_only" : "city_pattern");
        return estimate_;
    }

    setEstimate(ObdRouteState::Unknown, "ambiguous");
    return estimate_;
}

void ObdRouteClassifier::pushSample(uint8_t speedKph, float accelKphPer10s)
{
    speed_[next_] = speedKph;
    accel_[next_] = accelKphPer10s;
    next_ = (next_ + 1) % kWindowSize;
    if (count_ < kWindowSize)
    {
        count_++;
    }
}

ObdRouteClassifier::WindowStats ObdRouteClassifier::stats() const
{
    WindowStats out{};
    if (count_ == 0)
    {
        return out;
    }

    uint8_t high = 0;
    uint8_t stops = 0;
    uint8_t brakes = 0;
    uint8_t fastAccel = 0;
    float speedSum = 0.0f;
    float absAccelSum = 0.0f;

    for (uint8_t i = 0; i < count_; i++)
    {
        const uint8_t speed = speed_[i];
        const float accel = accel_[i];
        speedSum += speed;
        absAccelSum += fabsf(accel);
        if (speed >= 70)
        {
            high++;
        }
        if (speed <= 2)
        {
            stops++;
        }
        if (accel <= -6.0f)
        {
            brakes++;
        }
        if (fabsf(accel) >= 8.0f)
        {
            fastAccel++;
        }
    }

    out.avgSpeed = speedSum / count_;
    out.highSpeedPct = (static_cast<float>(high) * 100.0f) / count_;
    out.stopPct = (static_cast<float>(stops) * 100.0f) / count_;
    out.brakePct = (static_cast<float>(brakes) * 100.0f) / count_;
    out.fastAccelPct = (static_cast<float>(fastAccel) * 100.0f) / count_;
    out.avgAbsAccel = absAccelSum / count_;
    return out;
}

void ObdRouteClassifier::setEstimate(ObdRouteState state, const char *reason)
{
    estimate_.state = state;
    const bool highwayTransition = state == ObdRouteState::Highway &&
                                   reason &&
                                   (strcmp(reason, "possible_exit") == 0 || strcmp(reason, "highway_hold") == 0);
    estimate_.type = highwayTransition ? ObdRouteType::Unknown : typeForState(state);
    estimate_.score = score_;
    if (highwayTransition)
    {
        estimate_.confidencePct = strcmp(reason, "possible_exit") == 0 ? 45 : 55;
    }
    else if (state == ObdRouteState::Highway)
    {
        estimate_.confidencePct = clampU8(65 + score_ * 2, 0, 98);
    }
    else if (state == ObdRouteState::HighwayCandidate)
    {
        estimate_.confidencePct = clampU8(45 + candidateTicks_ * 3, 0, 82);
    }
    else if (state == ObdRouteState::City)
    {
        estimate_.confidencePct = clampU8(68 + (-score_) * 2, 0, 96);
    }
    else
    {
        estimate_.confidencePct = 20;
    }
    snprintf(estimate_.reason, sizeof(estimate_.reason), "%s", reason ? reason : "unknown");
}

ObdRouteType ObdRouteClassifier::typeForState(ObdRouteState state)
{
    if (state == ObdRouteState::Highway)
    {
        return ObdRouteType::Highway;
    }
    if (state == ObdRouteState::City)
    {
        return ObdRouteType::City;
    }
    return ObdRouteType::Unknown;
}

int8_t ObdRouteClassifier::clampScore(int16_t score)
{
    if (score < -14)
    {
        return -14;
    }
    if (score > 14)
    {
        return 14;
    }
    return static_cast<int8_t>(score);
}

const char *obd_route_type_name(ObdRouteType type)
{
    switch (type)
    {
    case ObdRouteType::City:
        return "city";
    case ObdRouteType::Highway:
        return "highway";
    case ObdRouteType::Unknown:
    default:
        return "unknown";
    }
}

const char *obd_route_state_name(ObdRouteState state)
{
    switch (state)
    {
    case ObdRouteState::City:
        return "city";
    case ObdRouteState::HighwayCandidate:
        return "highway_candidate";
    case ObdRouteState::Highway:
        return "highway";
    case ObdRouteState::Unknown:
    default:
        return "unknown";
    }
}
