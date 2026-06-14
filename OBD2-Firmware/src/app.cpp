#include "app.h"

#include <Arduino.h>
#include <WiFi.h>
#include <esp32_can.h>
#include <string.h>

#if __has_include("config.h")
#include "config.h"
#else
#define OBD_CONFIG_SOURCE_EXAMPLE 1
#include "config.example.h"
#endif

#include "app_config.h"
#include "obd_binary_logger.h"
#include "obd_dashboard.h"
#include "obd_service.h"

namespace
{
constexpr int LED_OK = 4;
constexpr int LED_ERR = 1;

#ifdef OBD_CONFIG_SOURCE_EXAMPLE
#warning "Using src/config.example.h. Copy it to src/config.h and set WiFi before flashing real hardware."
#endif

const char *WIFI_SSID = OBD_WIFI_SSID;
const char *WIFI_PASS = OBD_WIFI_PASS;

IPAddress DASH_HOST_FIXED(OBD_DASH_HOST_FIXED_OCTETS);
constexpr bool DASH_USE_BROADCAST = OBD_DASH_USE_BROADCAST;
constexpr uint16_t DASH_PORT = 3333;

constexpr gpio_num_t CAN_RX_PIN = GPIO_NUM_12;
constexpr gpio_num_t CAN_TX_PIN = GPIO_NUM_13;
constexpr gpio_num_t CAN_LBK_PIN = GPIO_NUM_14;

constexpr uint32_t APP_CAN_DEFAULT_BAUD = 500000;
constexpr bool ENABLE_ACTIVE_QUERY_FALLBACK = true;
constexpr bool SERIAL_DIAG = true;

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

bool wifi_ok = false;
bool can_ok = false;
bool config_loaded = false;

CanConfig active_can = {CAN_RX_PIN, CAN_TX_PIN, APP_CAN_DEFAULT_BAUD};

uint32_t last_wifi_retry_ms = 0;
uint32_t heartbeat_ms = 0;
uint32_t can_window = 0;

uint32_t stats_can_fps = 0;
uint32_t stats_rsp_fps = 0;
uint32_t stats_dec_fps = 0;
uint32_t stats_key_qps = 0;
uint32_t stats_bg_qps = 0;
uint32_t last_serial_diag_ms = 0;

IPAddress computeSubnetBroadcast()
{
    if (WiFi.status() != WL_CONNECTED)
    {
        return IPAddress(255, 255, 255, 255);
    }

    IPAddress ip = WiFi.localIP();
    IPAddress mask = WiFi.subnetMask();
    return IPAddress(
        (uint8_t)(ip[0] | (uint8_t)~mask[0]),
        (uint8_t)(ip[1] | (uint8_t)~mask[1]),
        (uint8_t)(ip[2] | (uint8_t)~mask[2]),
        (uint8_t)(ip[3] | (uint8_t)~mask[3]));
}

IPAddress selectDashHost()
{
    if (DASH_USE_BROADCAST)
    {
        return computeSubnetBroadcast();
    }

    return DASH_HOST_FIXED;
}

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

void connectWifiWithTimeout()
{
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);
    WiFi.begin(WIFI_SSID, WIFI_PASS);

    uint32_t startMs = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startMs < 20000)
    {
        pulseLed(LED_ERR, 60);
        delay(200);
    }

    wifi_ok = (WiFi.status() == WL_CONNECTED);
}

void handleWifiState(uint32_t nowMs)
{
    bool wifiNow = (WiFi.status() == WL_CONNECTED);

    if (wifiNow && !wifi_ok)
    {
        wifi_ok = true;
        DASH.setTarget(selectDashHost(), DASH_PORT);
    }
    else if (!wifiNow && wifi_ok)
    {
        wifi_ok = false;
    }

    if (!wifi_ok && (nowMs - last_wifi_retry_ms >= 5000))
    {
        last_wifi_retry_ms = nowMs;
        WiFi.reconnect();
    }
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

    pulseLed(wifi_ok ? LED_OK : LED_ERR, 40);
}

void emitSerialDiag(uint32_t nowMs)
{
    if (!SERIAL_DIAG || RUNTIME_CONFIG.serialDiagIntervalMs == 0)
    {
        return;
    }

    if (nowMs - last_serial_diag_ms < RUNTIME_CONFIG.serialDiagIntervalMs)
    {
        return;
    }
    last_serial_diag_ms = nowMs;

    IPAddress ip = WiFi.localIP();
    IPAddress mask = WiFi.subnetMask();
    IPAddress gw = WiFi.gatewayIP();
    IPAddress target = DASH.target();
    const ObdLogStats &logStats = LOGGER.stats();

    Serial.printf("[diag] wifi=%s ip=%u.%u.%u.%u mask=%u.%u.%u.%u gw=%u.%u.%u.%u target=%u.%u.%u.%u udp_tx=%lu udp_err=%lu can=%s route=%s rsp/s=%lu decoded/s=%lu key=%u bg=%u query=%u sup=%u key_q/s=%lu bg_q/s=%lu log=%s log_seq=%lu log_records=%lu/%lu log_err=%lu cfg=%s\n",
                  wifi_ok ? "UP" : "DOWN",
                  ip[0], ip[1], ip[2], ip[3],
                  mask[0], mask[1], mask[2], mask[3],
                  gw[0], gw[1], gw[2], gw[3],
                  target[0], target[1], target[2], target[3],
                  (unsigned long)DASH.txPackets(),
                  (unsigned long)DASH.txErrors(),
                  can_ok ? "OK" : "DOWN",
                  OBD.mode01RouteName(),
                  (unsigned long)stats_rsp_fps,
                  (unsigned long)stats_dec_fps,
                  (unsigned int)OBD.keyPidCount(),
                  (unsigned int)OBD.bgPidCount(),
                  (unsigned int)OBD.queryPidCount(),
                  (unsigned int)OBD.supportedPidCount(),
                  (unsigned long)stats_key_qps,
                  (unsigned long)stats_bg_qps,
                  logStats.ready ? (logStats.enabled ? "ON" : "OFF") : "DOWN",
                  (unsigned long)logStats.lastSequence,
                  (unsigned long)logStats.recordsWritten,
                  (unsigned long)logStats.capacityRecords,
                  (unsigned long)(logStats.writeErrors + logStats.eraseErrors),
                  config_loaded ? "ini" : "defaults");
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
    LOGGER.configure(RUNTIME_CONFIG.loggingEnabled, RUNTIME_CONFIG.loggingIntervalSeconds);
    bool logReady = LOGGER.begin();

    Serial.printf("[boot] config=%s log=%s log_capacity=%lu interval=%lus dashboard=%s/%lums\n",
                  config_loaded ? "ini" : "defaults",
                  logReady ? "ready" : "down",
                  (unsigned long)LOGGER.stats().capacityRecords,
                  (unsigned long)LOGGER.stats().intervalSeconds,
                  RUNTIME_CONFIG.dashboardEnabled ? "on" : "off",
                  (unsigned long)RUNTIME_CONFIG.dashboardIntervalMs);

    connectWifiWithTimeout();

    DASH.begin(selectDashHost(), DASH_PORT);

    initCan();
    pulseLed(LED_OK, 180);
}

void appLoop()
{
    uint32_t nowMs = millis();

    handleWifiState(nowMs);
    OBD.tick(nowMs, can_ok);
    processCanFrames(nowMs);
    refreshSecondStats(nowMs);

    ObdCompactSample compactSample{};
    OBD.collectCompactSample(nowMs, RUNTIME_CONFIG.loggingMaxSampleAgeSeconds * 1000UL, &compactSample);
    LOGGER.tick(nowMs, compactSample);

    ObdDashboardState dashState{};
    dashState.wifiUp = wifi_ok;
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
    dashState.rssi = WiFi.RSSI();
    const ObdLogStats &logStats = LOGGER.stats();
    dashState.logReady = logStats.ready;
    dashState.logEnabled = logStats.enabled;
    dashState.logSequence = logStats.lastSequence;
    dashState.logRecords = logStats.recordsWritten;
    dashState.logCapacity = logStats.capacityRecords;
    dashState.logErrors = logStats.writeErrors + logStats.eraseErrors;
    dashState.logIntervalSeconds = logStats.intervalSeconds;
    snprintf(dashState.mode01Route, sizeof(dashState.mode01Route), "%s", OBD.mode01RouteName());

    if (RUNTIME_CONFIG.dashboardEnabled)
    {
        DASH.tick(nowMs, dashState, OBD, OBD.vehicleInfo());
    }
    emitSerialDiag(nowMs);

    delay(1);
}
