#include "obd_ble_protocol.h"

#include <ArduinoJson.h>
#include <BLE2902.h>
#include <BLEDevice.h>
#include <mbedtls/base64.h>
#include <new>
#include <stdio.h>
#include <string.h>

#include "firmware_info.h"
#include "obd_anomaly_detector.h"

namespace
{
constexpr const char *kDeviceName = "AutoSense OBD2";
constexpr const char *kServiceUuid = "6f2d0001-5f9b-4b56-9f51-8f7f4a3a1001";
constexpr const char *kRxUuid = "6f2d0002-5f9b-4b56-9f51-8f7f4a3a1001";
constexpr const char *kTxUuid = "6f2d0003-5f9b-4b56-9f51-8f7f4a3a1001";
constexpr uint16_t kMaxChunkBytes = 96;
constexpr uint32_t kStreamIntervalMs = 1000;
constexpr uint16_t kMaxSupportedPidsBle = 24;

const char *jsonString(JsonVariantConst value)
{
    return value.is<const char *>() ? value.as<const char *>() : "";
}

void setChunkError(char *error, size_t errorSize, const char *message)
{
    if (error && errorSize > 0)
    {
        snprintf(error, errorSize, "%s", message ? message : "chunk_error");
    }
}
} // namespace

class ObdBleProtocol::RxCallbacks : public BLECharacteristicCallbacks
{
public:
    explicit RxCallbacks(ObdBleProtocol *owner) : owner_(owner) {}

    void onWrite(BLECharacteristic *characteristic) override
    {
        if (!owner_)
        {
            return;
        }
        owner_->handleWrite(characteristic->getValue());
    }

private:
    ObdBleProtocol *owner_;
};

class ObdBleProtocol::ServerCallbacks : public BLEServerCallbacks
{
public:
    explicit ServerCallbacks(ObdBleProtocol *owner) : owner_(owner) {}

    void onConnect(BLEServer *) override
    {
        Serial.println("[ble] client connected");
    }

    void onDisconnect(BLEServer *) override
    {
        if (owner_)
        {
            owner_->streaming_ = false;
            owner_->lastStreamMs_ = 0;
            owner_->pendingNotifyLen_ = 0;
            owner_->resetTransfer();
        }
        BLEDevice::startAdvertising();
        Serial.println("[ble] client disconnected; advertising restarted");
    }

private:
    ObdBleProtocol *owner_;
};

void ObdBleProtocol::begin(ProfileManager *profiles, ObdService *obd)
{
    profiles_ = profiles;
    obd_ = obd;

    BLEDevice::init(kDeviceName);
    BLEDevice::setMTU(247);
    server_ = BLEDevice::createServer();
    serverCallbacks_ = new ServerCallbacks(this);
    server_->setCallbacks(serverCallbacks_);
    BLEService *service = server_->createService(kServiceUuid);

    tx_ = service->createCharacteristic(
        kTxUuid,
        BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_READ);
    tx_->addDescriptor(new BLE2902());

    rx_ = service->createCharacteristic(
        kRxUuid,
        BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
    callbacks_ = new RxCallbacks(this);
    rx_->setCallbacks(callbacks_);

    service->start();
    BLEAdvertising *advertising = BLEDevice::getAdvertising();
    advertising->addServiceUUID(kServiceUuid);
    advertising->setScanResponse(true);
    advertising->start();
    Serial.println("[ble] advertising AutoSense OBD2");
}

void ObdBleProtocol::tick(uint32_t nowMs)
{
    flushPendingNotify();
    if (!streaming_ || !tx_ || !obd_)
    {
        return;
    }
    if (lastStreamMs_ != 0 && (nowMs - lastStreamMs_) < kStreamIntervalMs)
    {
        return;
    }

    lastStreamMs_ = nowMs;
    sendTelemetry(nowMs);
}

void ObdBleProtocol::setRouteEstimate(const ObdRouteEstimate &estimate)
{
    routeEstimate_ = estimate;
}

void ObdBleProtocol::deviceId(char *out, size_t outSize) const
{
    uint64_t mac = ESP.getEfuseMac();
    snprintf(out,
             outSize,
             "esp32s3-%04X%08X",
             (unsigned int)((mac >> 32) & 0xFFFF),
             (unsigned int)(mac & 0xFFFFFFFF));
}

void ObdBleProtocol::handleWrite(const std::string &value)
{
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, value.data(), value.size());
    if (err)
    {
        JsonDocument response;
        response["command"] = "ERROR";
        response["ok"] = false;
        response["error"] = "json_invalid";
        notifyJson(response);
        return;
    }

    handleCommand(doc["id"], jsonString(doc["command"]), doc["data"]);
}

void ObdBleProtocol::handleCommand(JsonVariantConst id, const char *command, JsonVariantConst data)
{
    if (!command || command[0] == '\0')
    {
        sendResponse(id, "ERROR", false, "command_missing");
        return;
    }
    if (strcmp(command, "PROFILE_CHUNK") != 0)
    {
        Serial.printf("[ble] command=%s\n", command);
    }

    if (strcmp(command, "GET_DEVICE_INFO") == 0)
    {
        sendDeviceInfo(id);
    }
    else if (strcmp(command, "READ_VIN") == 0)
    {
        sendVin(id);
    }
    else if (strcmp(command, "GET_ACTIVE_PROFILE") == 0)
    {
        sendActiveProfile(id);
    }
    else if (strcmp(command, "START_PROFILE_TRANSFER") == 0)
    {
        resetTransfer();
        transferExpectedSize_ = data["sizeBytes"] | 0;
        snprintf(transferSha256_, sizeof(transferSha256_), "%s", jsonString(data["sha256"]));
        if (transferExpectedSize_ == 0 || transferExpectedSize_ > ProfileManager::kMaxProfileBytes || transferSha256_[0] == '\0')
        {
            resetTransfer();
            sendResponse(id, command, false, "transfer_metadata_invalid");
            return;
        }
        transferBuffer_ = new (std::nothrow) char[ProfileManager::kMaxProfileBytes + 1]();
        if (!transferBuffer_)
        {
            resetTransfer();
            sendResponse(id, command, false, "transfer_alloc_failed");
            return;
        }
        sendResponse(id, command, true);
    }
    else if (strcmp(command, "PROFILE_CHUNK") == 0)
    {
        char error[40]{0};
        uint32_t offset = data["offset"] | 0;
        if (!appendProfileChunk(offset, jsonString(data["data"]), error, sizeof(error)))
        {
            sendResponse(id, command, false, error);
            return;
        }
        sendResponse(id, command, true);
    }
    else if (strcmp(command, "END_PROFILE_TRANSFER") == 0)
    {
        if (transferExpectedSize_ != transferSize_)
        {
            sendResponse(id, command, false, "profile_size_mismatch");
            return;
        }

        char error[48]{0};
        if (!transferBuffer_ || !profiles_ || !profiles_->validateProfileText(transferBuffer_,
                                                           transferSize_,
                                                           transferSha256_,
                                                           nullptr,
                                                           error,
                                                           sizeof(error)))
        {
            sendResponse(id, command, false, error[0] ? error : "profile_invalid");
            return;
        }
        sendResponse(id, command, true);
    }
    else if (strcmp(command, "APPLY_PROFILE") == 0)
    {
        char error[48]{0};
        if (!transferBuffer_ || !profiles_ || !profiles_->saveAndActivateProfile(transferBuffer_,
                                                             transferSize_,
                                                             transferSha256_,
                                                             error,
                                                             sizeof(error)))
        {
            sendResponse(id, command, false, error[0] ? error : "profile_apply_failed");
            return;
        }
        if (obd_)
        {
            obd_->applyRuntimeProfile(profiles_->activeProfile());
        }
        sendResponse(id, command, true);
        resetTransfer();
    }
    else if (strcmp(command, "GET_SUPPORTED_PIDS") == 0)
    {
        sendSupportedPids(id);
    }
    else if (strcmp(command, "START_STREAM") == 0)
    {
        streaming_ = true;
        lastStreamMs_ = 0;
        sendResponse(id, command, true);
    }
    else if (strcmp(command, "STOP_STREAM") == 0)
    {
        streaming_ = false;
        sendResponse(id, command, true);
    }
    else
    {
        sendResponse(id, command, false, "command_unknown");
    }
}

void ObdBleProtocol::sendResponse(JsonVariantConst id, const char *command, bool ok, const char *error)
{
    JsonDocument doc;
    if (!id.isNull())
    {
        doc["id"] = jsonString(id);
    }
    doc["command"] = command;
    doc["ok"] = ok;
    if (!ok)
    {
        doc["error"] = error ? error : "error";
    }
    notifyJson(doc);
}

void ObdBleProtocol::sendDeviceInfo(JsonVariantConst id)
{
    char idBuffer[32]{0};
    deviceId(idBuffer, sizeof(idBuffer));
    const char *requestId = jsonString(id);
    int len = snprintf(notifyBuffer_,
                       sizeof(notifyBuffer_),
                       "{\"id\":\"%s\",\"command\":\"GET_DEVICE_INFO\",\"ok\":true,"
                       "\"data\":{\"deviceId\":\"%s\",\"firmwareVersion\":\"%s\","
                       "\"hardwareVersion\":\"%s\",\"maxChunkBytes\":%u}}",
                       requestId,
                       idBuffer,
                       kAutoSenseFirmwareVersion,
                       kAutoSenseHardwareVersion,
                       (unsigned int)kMaxChunkBytes);
    if (len <= 0 || (size_t)len >= sizeof(notifyBuffer_))
    {
        return;
    }
    queueNotifyText((size_t)len);
}

void ObdBleProtocol::sendVin(JsonVariantConst id)
{
    const ObdVehicleInfo &info = obd_->vehicleInfo();
    if (info.vin[0] == '\0')
    {
        sendResponse(id, "READ_VIN", false, "vin_unavailable");
        return;
    }

    JsonDocument doc;
    doc["id"] = jsonString(id);
    doc["command"] = "READ_VIN";
    doc["ok"] = true;
    JsonObject data = doc["data"].to<JsonObject>();
    data["vin"] = info.vin;
    notifyJson(doc);
}

void ObdBleProtocol::sendActiveProfile(JsonVariantConst id)
{
    JsonDocument doc;
    doc["id"] = jsonString(id);
    doc["command"] = "GET_ACTIVE_PROFILE";
    doc["ok"] = true;
    JsonObject data = doc["data"].to<JsonObject>();
    data["profileId"] = profiles_ ? profiles_->activeProfileId() : "";
    data["profileVersion"] = profiles_ ? profiles_->activeProfileVersion() : "";
    data["sha256"] = profiles_ ? profiles_->activeProfileHash() : "";
    notifyJson(doc);
}

void ObdBleProtocol::sendSupportedPids(JsonVariantConst id)
{
    JsonDocument doc;
    doc["id"] = jsonString(id);
    doc["command"] = "GET_SUPPORTED_PIDS";
    doc["ok"] = true;
    JsonArray pids = doc["data"]["pids"].to<JsonArray>();

    uint8_t pidValues[96]{0};
    uint16_t count = obd_ ? obd_->collectSupportedPids(pidValues, sizeof(pidValues)) : 0;
    char pidText[3]{0};
    if (count > kMaxSupportedPidsBle)
    {
        count = kMaxSupportedPidsBle;
    }
    for (uint16_t i = 0; i < count; i++)
    {
        snprintf(pidText, sizeof(pidText), "%02X", pidValues[i]);
        pids.add(pidText);
    }
    notifyJson(doc);
}

void ObdBleProtocol::sendTelemetry(uint32_t nowMs)
{
    ObdCompactSample sample{};
    bool hasSample = obd_ && obd_->collectCompactSample(nowMs, 5000, &sample);

    JsonDocument doc;
    doc["command"] = "TELEMETRY";
    doc["ok"] = true;
    JsonObject data = doc["data"].to<JsonObject>();
    data["speed"] = hasSample && (sample.validMask & OBD_SAMPLE_SPEED) ? sample.speedKph : 0;
    data["rpm"] = hasSample && (sample.validMask & OBD_SAMPLE_RPM) ? sample.rpm : 0;
    data["engineTemp"] = hasSample && (sample.validMask & OBD_SAMPLE_COOLANT) ? sample.coolantC : 0;
    data["fuelLiters"] = hasSample && (sample.validMask & OBD_SAMPLE_FUEL_LEVEL) ? (sample.fuelLevelPct * 0.6f) : 0;
    data["engineLoad"] = hasSample && (sample.validMask & OBD_SAMPLE_ENGINE_LOAD) ? sample.engineLoadPct : 0;
    data["voltage"] = hasSample && (sample.validMask & OBD_SAMPLE_ECU_VOLTAGE) ? (sample.ecuMv / 1000.0f) : 0;
    data["throttle"] = hasSample && (sample.validMask & OBD_SAMPLE_THROTTLE) ? sample.throttlePct : 0;
    data["intakeTemp"] = hasSample && (sample.validMask & OBD_SAMPLE_INTAKE_AIR) ? sample.intakeAirC : 0;
    data["validMask"] = hasSample ? sample.validMask : 0;
    data["routeType"] = obd_route_type_name(routeEstimate_.type);
    data["routeState"] = obd_route_state_name(routeEstimate_.state);
    data["routeConfidence"] = routeEstimate_.confidencePct;
    data["routeScore"] = routeEstimate_.score;
    data["routeReason"] = routeEstimate_.reason;
    const AnomalyResult &anomaly = obd_anomaly_last_result();
    JsonObject anomalyData = data["anomaly"].to<JsonObject>();
    anomalyData["score"] = anomaly.score;
    anomalyData["severity"] = obd_anomaly_severity_name(anomaly.severity);
    anomalyData["areaMask"] = anomaly.areaMask;
    anomalyData["baselineReady"] = anomaly.baselineReady;
    anomalyData["modelReady"] = anomaly.modelReady;
    notifyJson(doc);
}

bool ObdBleProtocol::notifyJson(JsonDocument &doc)
{
    size_t len = serializeJson(doc, notifyBuffer_, sizeof(notifyBuffer_));
    if (len == 0 || len >= sizeof(notifyBuffer_))
    {
        return false;
    }
    return queueNotifyText(len);
}

bool ObdBleProtocol::queueNotifyText(size_t len)
{
    if (len == 0 || len >= sizeof(notifyBuffer_))
    {
        return false;
    }
    pendingNotifyLen_ = len;
    return true;
}

void ObdBleProtocol::flushPendingNotify()
{
    if (!tx_ || pendingNotifyLen_ == 0)
    {
        return;
    }

    tx_->setValue((uint8_t *)notifyBuffer_, pendingNotifyLen_);
    tx_->notify();
    pendingNotifyLen_ = 0;
}

bool ObdBleProtocol::appendProfileChunk(uint32_t offset, const char *base64Data, char *error, size_t errorSize)
{
    if (!base64Data || base64Data[0] == '\0')
    {
        setChunkError(error, errorSize, "chunk_empty");
        return false;
    }
    if (offset != transferSize_)
    {
        setChunkError(error, errorSize, "chunk_offset_invalid");
        return false;
    }
    if (!transferBuffer_)
    {
        setChunkError(error, errorSize, "transfer_not_started");
        return false;
    }
    if (transferSize_ >= ProfileManager::kMaxProfileBytes)
    {
        setChunkError(error, errorSize, "profile_too_large");
        return false;
    }

    size_t outLen = 0;
    size_t available = ProfileManager::kMaxProfileBytes - transferSize_;
    int rc = mbedtls_base64_decode((unsigned char *)transferBuffer_ + transferSize_,
                                   available,
                                   &outLen,
                                   (const unsigned char *)base64Data,
                                   strlen(base64Data));
    if (rc != 0 || outLen == 0)
    {
        setChunkError(error, errorSize, "chunk_base64_invalid");
        return false;
    }

    transferSize_ += outLen;
    transferBuffer_[transferSize_] = '\0';
    return true;
}

void ObdBleProtocol::resetTransfer()
{
    delete[] transferBuffer_;
    transferBuffer_ = nullptr;
    transferSize_ = 0;
    transferExpectedSize_ = 0;
    memset(transferSha256_, 0, sizeof(transferSha256_));
}
