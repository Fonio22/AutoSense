#include "obd_route_classifier.h"

#include <cstdlib>
#include <iostream>

namespace
{
uint32_t nowMs = 0;

ObdRouteEstimate feed(ObdRouteClassifier &classifier, uint8_t speedKph)
{
    nowMs += ObdRouteClassifier::kSampleIntervalMs;
    ObdRouteInput input{};
    input.validMask = ROUTE_INPUT_SPEED | ROUTE_INPUT_RPM | ROUTE_INPUT_ENGINE_LOAD | ROUTE_INPUT_THROTTLE;
    input.speedKph = speedKph;
    input.rpm = speedKph == 0 ? 720 : static_cast<uint16_t>(900 + speedKph * 13);
    input.engineLoadPct = speedKph == 0 ? 16 : 35;
    input.throttlePct = speedKph == 0 ? 7 : 18;
    return classifier.update(nowMs, input);
}

void resetTimeline()
{
    nowMs = 0;
}

void requireRoute(bool condition, const char *message, const ObdRouteClassifier &classifier)
{
    if (!condition)
    {
        const ObdRouteEstimate &estimate = classifier.lastEstimate();
        std::cerr << "[fail] " << message
                  << " type=" << obd_route_type_name(estimate.type)
                  << " state=" << obd_route_state_name(estimate.state)
                  << " confidence=" << static_cast<int>(estimate.confidencePct)
                  << " score=" << static_cast<int>(estimate.score)
                  << " reason=" << estimate.reason << "\n";
        std::exit(1);
    }
}

void feedMinutes(ObdRouteClassifier &classifier, uint8_t speedKph, uint8_t minutes)
{
    const uint16_t samples = static_cast<uint16_t>(minutes) * 6U;
    for (uint16_t i = 0; i < samples; i++)
    {
        feed(classifier, speedKph);
    }
}

void testCityStopGo()
{
    ObdRouteClassifier classifier;
    classifier.reset();
    resetTimeline();
    for (uint8_t i = 0; i < 36; i++)
    {
        const uint8_t speed = (i % 6) < 2 ? 0 : static_cast<uint8_t>(22 + (i % 5) * 4);
        feed(classifier, speed);
    }
    requireRoute(classifier.lastEstimate().type == ObdRouteType::City, "stop-go city should remain city", classifier);
}

void testShortFastBurstIsNotHighway()
{
    ObdRouteClassifier classifier;
    classifier.reset();
    resetTimeline();
    feedMinutes(classifier, 28, 4);
    for (uint8_t i = 0; i < 12; i++)
    {
        feed(classifier, i < 6 ? 82 : 92);
    }
    requireRoute(classifier.lastEstimate().type != ObdRouteType::Highway, "short fast burst must not become highway", classifier);
}

void testSustainedHighwayConfirms()
{
    ObdRouteClassifier classifier;
    classifier.reset();
    resetTimeline();
    for (uint8_t i = 0; i < 42; i++)
    {
        const uint8_t speed = static_cast<uint8_t>(92 + (i % 5));
        feed(classifier, speed);
    }
    requireRoute(classifier.lastEstimate().type == ObdRouteType::Highway, "sustained stable speed should confirm highway", classifier);
}

void testShortTollDoesNotCutHighway()
{
    ObdRouteClassifier classifier;
    classifier.reset();
    resetTimeline();
    feedMinutes(classifier, 96, 7);
    requireRoute(classifier.lastEstimate().type == ObdRouteType::Highway, "setup should be highway", classifier);
    feedMinutes(classifier, 0, 3);
    requireRoute(classifier.lastEstimate().state == ObdRouteState::Highway, "short toll/rest stop should hold highway state", classifier);
}

void testSustainedCityExit()
{
    ObdRouteClassifier classifier;
    classifier.reset();
    resetTimeline();
    feedMinutes(classifier, 96, 7);
    requireRoute(classifier.lastEstimate().type == ObdRouteType::Highway, "setup should be highway", classifier);
    for (uint8_t i = 0; i < 42; i++)
    {
        const uint8_t speed = (i % 6) < 3 ? 0 : static_cast<uint8_t>(18 + (i % 4) * 5);
        feed(classifier, speed);
    }
    requireRoute(classifier.lastEstimate().type == ObdRouteType::City, "sustained urban pattern should exit to city", classifier);
}
} // namespace

int main()
{
    testCityStopGo();
    testShortFastBurstIsNotHighway();
    testSustainedHighwayConfirms();
    testShortTollDoesNotCutHighway();
    testSustainedCityExit();
    std::cout << "[ok] route classifier selftest passed\n";
    return 0;
}
