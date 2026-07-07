# AutoSense

AutoSense is an Edge-IoT vehicle monitoring project based on an ESP32-S3 OBD-II/CAN adapter, a React Native mobile app, Firebase services, and a LaTeX thesis document.

Repository: <https://github.com/Fonio22/AutoSense>

## What It Does

- Reads vehicle telemetry from OBD-II over CAN.
- Stores compact binary history locally on the ESP32-S3.
- Streams live telemetry to the mobile app through BLE.
- Exports unsynced binary logs from the ESP32-S3 to the app without deleting them from flash.
- Uploads historical log files to Firebase Storage and stores sync metadata in Firestore.
- Uses lightweight edge analysis with statistical baselines, Z-score, and Tiny Isolation Forest.
- Documents the project in the thesis under `Writting/main.tex`.

## Repository Layout

```text
OBD2-Firmware/       ESP32-S3 firmware, OBD-II service, BLE protocol, logger, anomaly analysis
app/                 Expo / React Native mobile app and Firebase rules
vehicle-profiles/    Vehicle profile definitions, including vw_passat_2016
kiCad/               PCB design and schematic files
outputs/             Processed datasets and exported analysis inputs
Writting/            LaTeX thesis source, figures, references, and compiled PDF
```

## Firmware

```bash
cd OBD2-Firmware
pio run
```

Main modules:

- `src/app.cpp`: boot sequence and main loop.
- `src/obd_service.cpp`: PID discovery, polling, and OBD-II decoding.
- `src/obd_binary_logger.*`: compact binary log storage and export.
- `src/obd_ble_protocol.*`: BLE commands, telemetry stream, and log sync.
- `src/anomaly_detector.*`: baseline, Z-score, Tiny Isolation Forest, and severity levels.

## Mobile App

```bash
cd app
npm install
npx tsc --noEmit
npm run lint
npm run ios
```

The app uses Expo Router, Firebase Auth, Firestore, Firebase Storage, SecureStore, BLE, and local file storage for downloaded OBD logs.

Profile resolver tests:

```bash
cd app
node --test functions/test/profile-resolver.test.mjs
```

## Thesis

```bash
cd Writting
latexmk -pdf -interaction=nonstopmode -file-line-error main.tex
```

Main files:

- `Writting/main.tex`: thesis source.
- `Writting/main.pdf`: generated thesis PDF.
- `Writting/Reference/references.bib`: bibliography.
- `Writting/Figures/`: diagrams, screenshots, test photos, and result charts.

## Validation Snapshot

The current thesis documents:

- Volkswagen Passat 2016 as the main real-vehicle validation profile.
- OBD-II simulator testing with a generic profile.
- A 60-day route-classified dataset with city, highway, and unknown segments.
- Functional tests for acquisition, BLE/USB communication, storage, visualization, and analysis.

## Safety Scope

AutoSense is designed as a read-only monitoring system. It does not erase diagnostic trouble codes, does not write to vehicle ECUs, and does not replace professional mechanical diagnosis.
