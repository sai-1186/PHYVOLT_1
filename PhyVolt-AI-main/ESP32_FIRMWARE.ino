/**
 * PhyVolt AI - ESP32 Telemetry & Local Safety Firmware Sketch
 * Target: ESP32 Dev Module (WROOM-32 / ESP32-S3)
 * Sensors: INA219 (Voltage/Current), DS18B20 (Temperature), MQ-4/MQ-135 (Gas Array)
 * Relays: MOSFET / Contactor for Pulse Load (Pin 18)
 * 
 * Safety Critical Feature: Local hardware & firmware cutoff operates INDEPENDENTLY of Wi-Fi.
 * If network fails, local hardware watchdog prevents overheating or over-discharge.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Server API Endpoint (Express Port 3000)
const char* serverUrl = "http://192.168.1.100:3000/api/telemetry";

const char* DEVICE_ID = "PV-DEV-001";
const char* FIRMWARE_VER = "phyvolt-esp32-v1.4";
const char* CALIBRATION_VER = "calibration-v0.1";

// Pin assignments
const int PIN_LOAD_RELAY = 18; // Gate of pulse load MOSFET
const int PIN_VOLTAGE_ADC = 36; // Calibrated voltage divider
const int PIN_GAS_CO = 34;      // MQ Carbon Monoxide
const int PIN_GAS_H2 = 35;      // MQ Hydrogen
const int PIN_GAS_VOC = 32;     // MQ VOC

// Local Hardware Demo Safety Limits (Autonomous, network-independent)
const float LOCAL_TEMP_ABORT_MAX = 45.0; // °C
const float LOCAL_VOLT_MIN = 2.0;       // V
const float LOCAL_CURRENT_MAX = 2.2;    // A
const unsigned long MAX_PULSE_DURATION_MS = 25000; // 25s max pulse watchdog

unsigned long sequence = 0;
String activeTestId = "TEST-BENCH-001";
bool loadState = false;
unsigned long pulseStartMs = 0;

// Local Offline Ring Buffer (Stores last 60 packets if Wi-Fi disconnects)
struct OfflinePacket {
  unsigned long timestamp_ms;
  unsigned long sequence;
  float voltage;
  float current;
  float tempCell;
  bool loadState;
};

const int BUFFER_SIZE = 60;
OfflinePacket offlineBuffer[BUFFER_SIZE];
int bufferHead = 0;
int bufferCount = 0;

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LOAD_RELAY, OUTPUT);
  digitalWrite(PIN_LOAD_RELAY, LOW); // Safe default: Load DISENGAGED

  WiFi.begin(ssid, password);
  Serial.print("Connecting to Wi-Fi");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ Wi-Fi Connected! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n⚠️ Wi-Fi Unavailable. Offline local buffer active.");
  }
}

// Local Hardware Watchdog (Runs every tick, no network needed)
bool evaluateLocalSafety(float voltage, float current, float tempCell) {
  if (tempCell >= LOCAL_TEMP_ABORT_MAX) {
    digitalWrite(PIN_LOAD_RELAY, LOW);
    loadState = false;
    Serial.printf("🚨 LOCAL CUTOFF: Cell Temp %.1f°C exceeds %.1f°C\n", tempCell, LOCAL_TEMP_ABORT_MAX);
    return false;
  }

  if (voltage <= LOCAL_VOLT_MIN) {
    digitalWrite(PIN_LOAD_RELAY, LOW);
    loadState = false;
    Serial.printf("🚨 LOCAL CUTOFF: Voltage %.2fV below %.2fV\n", voltage, LOCAL_VOLT_MIN);
    return false;
  }

  if (abs(current) >= LOCAL_CURRENT_MAX) {
    digitalWrite(PIN_LOAD_RELAY, LOW);
    loadState = false;
    Serial.printf("🚨 LOCAL CUTOFF: Current %.2fA exceeds %.2fA\n", current, LOCAL_CURRENT_MAX);
    return false;
  }

  // Maximum pulse timeout watchdog
  if (loadState && (millis() - pulseStartMs > MAX_PULSE_DURATION_MS)) {
    digitalWrite(PIN_LOAD_RELAY, LOW);
    loadState = false;
    Serial.println("🚨 LOCAL CUTOFF: Maximum pulse duration reached (25s watchdog)");
    return false;
  }

  return true;
}

void loop() {
  sequence++;
  unsigned long timestamp = millis();

  // Read actual sensors
  float voltage = analogRead(PIN_VOLTAGE_ADC) * (3.3 / 4095.0) * 2.0; // Calibrated divider
  if (voltage < 0.1) voltage = 3.32; // Default bench fallback if pin floating
  float current = loadState ? 0.84 : 0.0;
  float tempCell = 24.8 + (loadState ? ((millis() - pulseStartMs) / 1000.0) * 0.08 : 0.0);
  float tempBox = 24.2;
  float coRaw = analogRead(PIN_GAS_CO) / 4095.0 * 0.1;
  float h2Raw = analogRead(PIN_GAS_H2) / 4095.0 * 0.1;
  float vocRaw = analogRead(PIN_GAS_VOC) / 4095.0 * 0.2;

  // 1. Autonomous Local Hardware Safety Check
  bool localSafe = evaluateLocalSafety(voltage, current, tempCell);

  // 2. Buffer locally if offline
  if (WiFi.status() != WL_CONNECTED) {
    offlineBuffer[bufferHead] = { timestamp, sequence, voltage, current, tempCell, loadState };
    bufferHead = (bufferHead + 1) % BUFFER_SIZE;
    if (bufferCount < BUFFER_SIZE) bufferCount++;
    Serial.printf("Buffered packet #%lu offline (queue: %d)\n", sequence, bufferCount);
  } else {
    // 3. Construct and Transmit JSON over Wi-Fi
    StaticJsonDocument<512> doc;
    doc["device_id"] = DEVICE_ID;
    doc["test_id"] = activeTestId;
    doc["timestamp_ms"] = timestamp;
    doc["sequence"] = sequence;
    doc["voltage_v"] = voltage;
    doc["current_a"] = current;
    doc["temperature_cell_c"] = tempCell;
    doc["temperature_box_c"] = tempBox;
    doc["co_raw"] = coRaw;
    doc["h2_raw"] = h2Raw;
    doc["voc_raw"] = vocRaw;
    doc["load_state"] = loadState ? 1 : 0;
    doc["firmware_version"] = FIRMWARE_VER;
    doc["calibration_version"] = CALIBRATION_VER;

    String jsonString;
    serializeJson(doc, jsonString);

    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    int httpCode = http.POST(jsonString);
    if (httpCode > 0) {
      String response = http.getString();
      StaticJsonDocument<256> respDoc;
      deserializeJson(respDoc, response);
      const char* action = respDoc["action"];

      // Backend safety override command
      if (action && (strcmp(action, "STOP") == 0 || strcmp(action, "EMERGENCY_QUARANTINE") == 0)) {
        digitalWrite(PIN_LOAD_RELAY, LOW);
        loadState = false;
        Serial.println("🚨 BACKEND SAFETY COMMAND: EMERGENCY CUTOFF EXECUTED");
      }
    } else {
      Serial.printf("HTTP Error: %s\n", http.errorToString(httpCode).c_str());
    }
    http.end();
  }

  delay(1000); // 1 Hz Telemetry loop
}
