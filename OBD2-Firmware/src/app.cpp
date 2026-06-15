#include "app.h"

#include <Arduino.h>
#include <esp32_can.h>
#include <string.h>

#include "app_config.h"
#include "obd_binary_logger.h"
#include "obd_dashboard.h"
#include "obd_service.h"

namespace
{
constexpr int LED_OK = 4;
constexpr int LED_ERR = 1;

constexpr gpio_num_t CAN_RX_PIN = GPIO_NUM_12;
constexpr gpio_num_t CAN_TX_PIN = GPIO_NUM_13;
constexpr gpio_num_t CAN_LBK_PIN = GPIO_NUM_14;

constexpr uint32_t APP_CAN_DEFAULT_BAUD = 500000;
constexpr bool ENABLE_ACTIVE_QUERY_FALLBACK = true;

struct CanConfig
{
    gpio_num_t rx;
    gpio_num_t tx;
    uint32_t baud;
};

ObdService OBD;
ObdDashboard DASH;
ObdBinaryLogger LOGGER;
AppRuntimeConfig RUNTIME_CONFIG;

bool can_ok = false;
bool config_loaded = false;

CanConfig active_can = {CAN_RX_PIN, CAN_TX_PIN, APP_CAN_DEFAULT_BAUD};

uint32_t heartbeat_ms = 0;
uint32_t can_window = 0;

uint32_t stats_can_fps = 0;
uint32_t stats_rsp_fps = 0;
uint32_t stats_dec_fps = 0;
uint32_t stats_key_qps = 0;
uint32_t stats_bg_qps = 0;

void pulseLed(int pin, int ms)
{
    digitalWrite(pin, HIGH);
    delay(ms);
    digitalWrite(pin, LOW);
}

bool startCan(const CanConfig &cfg, uint32_t *startedBaud = nullptr)
{
    // NOTE: CAN0.begin()/mode setters already perform disable+enable internally.
    // Calling disable() here adds extra churn and can destabilize TWAI tasks/queues.
    CAN0.setCANPins(cfg.rx, cfg.tx);

    uint32_t setBaud = CAN0.begin(cfg.baud);
    if (setBaud == cfg.baud)
    {
        // Allow active querying even on sparse/no-ACK benches.
        CAN0.setNoACKMode(true);
    }
    CAN0.watchFor();

    if (startedBaud)
    {
        *startedBaud = setBaud;
    }

    can_ok = (setBaud == cfg.baud);
    if (can_ok)
    {
        active_can = cfg;
    }
    return can_ok;
}

void initCan()
{
    // Keep TWAI churn minimal: single init in normal mode.
    bool ok = startCan({CAN_RX_PIN, CAN_TX_PIN, APP_CAN_DEFAULT_BAUD});
    OBD.setActiveQuery(ok && ENABLE_ACTIVE_QUERY_FALLBACK);
}

void processCanFrames(uint32_t nowMs)
{
    CAN_FRAME frame;
    while (CAN0.read(frame))
    {
        OBD.handleFrame(frame, nowMs);
        can_window++;
    }
}

void refreshSecondStats(uint32_t nowMs)
{
    if (heartbeat_ms == 0)
    {
        heartbeat_ms = nowMs;
        return;
    }

    if (nowMs - heartbeat_ms < 1000)
    {
        return;
    }

    stats_can_fps = can_window;
    stats_rsp_fps = OBD.responsesWindow();
    stats_dec_fps = OBD.decodedWindow();
    stats_key_qps = OBD.keyQueryPerSec();
    stats_bg_qps = OBD.bgQueryPerSec();

    can_window = 0;
    OBD.clearWindowCounters();
    heartbeat_ms = nowMs;

    pulseLed(can_ok ? LED_OK : LED_ERR, 40);
}
} // namespace

void appSetup()
{
    Serial.begin(115200);
    delay(120);

    pinMode(LED_OK, OUTPUT);
    pinMode(LED_ERR, OUTPUT);
    digitalWrite(LED_OK, LOW);
    digitalWrite(LED_ERR, LOW);

    // SN65HVD233 loopback pin forced LOW for normal transceiver mode.
    pinMode(CAN_LBK_PIN, OUTPUT);
    digitalWrite(CAN_LBK_PIN, LOW);

    OBD.begin();
    config_loaded = loadAppRuntimeConfig(RUNTIME_CONFIG);
    DASH.setIntervalMs(RUNTIME_CONFIG.dashboardIntervalMs);
    DASH.begin();
    LOGGER.configure(RUNTIME_CONFIG.loggingEnabled, RUNTIME_CONFIG.loggingIntervalSeconds);
    bool logReady = LOGGER.begin();

    Serial.printf("[boot] config=%s log=%s log_capacity=%lu interval=%lus dashboard=%s/%lums ebook=%s transport=USB-CDC\n",
                  config_loaded ? "ini" : "defaults",
                  logReady ? "ready" : "down",
                  (unsigned long)LOGGER.stats().capacityRecords,
                  (unsigned long)LOGGER.stats().intervalSeconds,
                  RUNTIME_CONFIG.dashboardEnabled ? "on" : "off",
                  (unsigned long)RUNTIME_CONFIG.dashboardIntervalMs,
                  RUNTIME_CONFIG.dashboardEbookMode ? "on" : "off");

    initCan();
    pulseLed(LED_OK, 180);
}

void appLoop()
{
    uint32_t nowMs = millis();

    OBD.tick(nowMs, can_ok);
    processCanFrames(nowMs);
    refreshSecondStats(nowMs);

    ObdCompactSample compactSample{};
    OBD.collectCompactSample(nowMs, RUNTIME_CONFIG.loggingMaxSampleAgeSeconds * 1000UL, &compactSample);
    LOGGER.tick(nowMs, compactSample);

    ObdDashboardState dashState{};
    dashState.canOk = can_ok;
    dashState.queryMode = OBD.activeQuery();
    dashState.queryPidCount = OBD.queryPidCount();
    dashState.keyPidCount = OBD.keyPidCount();
    dashState.bgPidCount = OBD.bgPidCount();
    dashState.supportedPidCount = OBD.supportedPidCount();
    dashState.canFps = stats_can_fps;
    dashState.obdRspPerSec = stats_rsp_fps;
    dashState.obdDecPerSec = stats_dec_fps;
    dashState.keyQueryPerSec = stats_key_qps;
    dashState.bgQueryPerSec = stats_bg_qps;
    dashState.uptimeMs = nowMs;
    const ObdLogStats &logStats = LOGGER.stats();
    dashState.logReady = logStats.ready;
    dashState.logEnabled = logStats.enabled;
    dashState.logSequence = logStats.lastSequence;
    dashState.logRecords = logStats.recordsWritten;
    dashState.logCapacity = logStats.capacityRecords;
    dashState.logErrors = logStats.writeErrors + logStats.eraseErrors;
    dashState.logIntervalSeconds = logStats.intervalSeconds;
    dashState.ebookMode = RUNTIME_CONFIG.dashboardEbookMode;
    snprintf(dashState.route, sizeof(dashState.route), "%s", OBD.mode01RouteName());
    snprintf(dashState.transport, sizeof(dashState.transport), "%s", "USB-CDC");

    if (RUNTIME_CONFIG.dashboardEnabled)
    {
        DASH.tick(nowMs, dashState, OBD, OBD.vehicleInfo());
    }

    delay(1);
}
