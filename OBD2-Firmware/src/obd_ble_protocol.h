#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <BLECharacteristic.h>
#include <BLEServer.h>

#include "obd_binary_logger.h"
#include "obd_route_classifier.h"
#include "obd_service.h"
#include "vehicle_profile.h"

class ObdBleProtocol
{
public:
    void begin(ProfileManager *profiles, ObdService *obd, ObdBinaryLogger *logger);
    void tick(uint32_t nowMs);
    void setRouteEstimate(const ObdRouteEstimate &estimate);

private:
    class RxCallbacks;
    class ServerCallbacks;

    void handleWrite(const std::string &value);
    void handleCommand(JsonVariantConst id, const char *command, JsonVariantConst data);
    void sendResponse(JsonVariantConst id, const char *command, bool ok, const char *error = nullptr);
    void sendDeviceInfo(JsonVariantConst id);
    void sendLogInfo(JsonVariantConst id);
    void startLogExport(JsonVariantConst id, JsonVariantConst data);
    void sendLogChunk(JsonVariantConst id, JsonVariantConst data);
    void sendActiveProfile(JsonVariantConst id);
    void sendSupportedPids(JsonVariantConst id);
    void sendVin(JsonVariantConst id);
    void sendTelemetry(uint32_t nowMs);
    bool notifyJson(JsonDocument &doc);
    bool queueNotifyText(size_t len);
    void flushPendingNotify();
    bool appendProfileChunk(uint32_t offset, const char *base64Data, char *error, size_t errorSize);
    void resetTransfer();
    void resetLogExport();
    void deviceId(char *out, size_t outSize) const;

    ProfileManager *profiles_{nullptr};
    ObdService *obd_{nullptr};
    ObdBinaryLogger *logger_{nullptr};
    BLEServer *server_{nullptr};
    BLECharacteristic *tx_{nullptr};
    BLECharacteristic *rx_{nullptr};
    RxCallbacks *callbacks_{nullptr};
    ServerCallbacks *serverCallbacks_{nullptr};

    bool streaming_{false};
    uint32_t lastStreamMs_{0};
    ObdRouteEstimate routeEstimate_{};
    char notifyBuffer_[1024]{0};
    size_t pendingNotifyLen_{0};

    char *transferBuffer_{nullptr};
    size_t transferSize_{0};
    size_t transferExpectedSize_{0};
    char transferSha256_[ProfileManager::kSha256HexLen + 1]{0};

    bool logExportActive_{false};
    uint32_t logExportAfterSequence_{0};
    uint32_t logExportUntilSequence_{0};
    uint32_t logExportNextSlot_{0};
    uint32_t logExportTotalRecords_{0};
    uint32_t logExportSentRecords_{0};
};
