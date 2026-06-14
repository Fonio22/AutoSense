#pragma once

// Copy this file to src/config.h and fill in local values before flashing.
#define OBD_WIFI_SSID "YOUR_WIFI_SSID"
#define OBD_WIFI_PASS "YOUR_WIFI_PASSWORD"

// Used only when OBD_DASH_USE_BROADCAST is false.
#define OBD_DASH_HOST_FIXED_OCTETS 192, 168, 31, 239

// Broadcast is more reliable with the current ESP32/Mac UDP terminal setup.
#define OBD_DASH_USE_BROADCAST true
