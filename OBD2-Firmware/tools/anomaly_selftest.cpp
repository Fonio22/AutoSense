#include "obd_anomaly_detector.h"

#include <assert.h>
#include <stdio.h>

namespace
{
ObdSample sample(uint32_t t, uint16_t rpm, uint8_t speed, uint16_t mv)
{
    ObdSample s{};
    s.timestampMs = t;
    s.validMask = ANOMALY_SAMPLE_RPM | ANOMALY_SAMPLE_SPEED | ANOMALY_SAMPLE_ECU_VOLTAGE |
                  ANOMALY_SAMPLE_COOLANT | ANOMALY_SAMPLE_INTAKE_AIR;
    s.rpm = rpm;
    s.speedKph = speed;
    s.ecuMv = mv;
    s.coolantC = 90;
    s.intakeAirC = 32;
    return s;
}

void configure(uint32_t minSamples)
{
    ObdAnomalyConfig cfg{};
    cfg.minSamples = minSamples;
    cfg.saveIntervalSeconds = 300;
    cfg.debugLogs = false;
    obd_anomaly_configure(cfg);
    obd_anomaly_set_identity("selftest", "hash");
    obd_anomaly_reset_baseline();
}
} // namespace

int main()
{
    configure(20);
    AnomalyResult r{};
    for (uint32_t i = 0; i < 40; i++)
    {
        r = obd_anomaly_process_sample(sample(i * 10000UL, 800 + (i % 3), 0, 14000));
    }
    assert(r.baselineReady);
    assert(r.severity == AnomalySeverity::Normal);

    r = obd_anomaly_process_sample(sample(410000, 820, 0, 11200));
    assert(r.severity == AnomalySeverity::Watch);
    r = obd_anomaly_process_sample(sample(420000, 830, 0, 11200));
    assert(r.severity == AnomalySeverity::Watch);
    r = obd_anomaly_process_sample(sample(430000, 840, 0, 11200));
    assert(r.severity >= AnomalySeverity::Warning);

    ObdSample missing{};
    missing.timestampMs = 440000;
    missing.validMask = ANOMALY_SAMPLE_RPM;
    missing.rpm = 850;
    r = obd_anomaly_process_sample(missing);
    assert(r.validMask == ANOMALY_SAMPLE_RPM);

    configure(20);
    for (uint32_t i = 0; i < 120; i++)
    {
        r = obd_anomaly_process_sample(sample(i * 10000UL, 780 + (i % 4), 0, 14000));
    }
    assert(obd_anomaly_is_model_ready());

    puts("ANOMALY SELFTEST OK");
    return 0;
}
