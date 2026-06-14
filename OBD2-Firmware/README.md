# OBD2-Firmware

Firmware para ESP32-S3 que consulta datos OBD2 por CAN, muestra un dashboard ANSI por UDP y guarda un historial binario compacto en la flash interna.

Flujo actual:

```text
Simulador OBD2 -> CAN -> ESP32-S3 -> WiFi UDP :3333 -> terminal en la Mac
                                      -> flash interna -> log binario circular
```

## Que hace

- Inicializa WiFi y CAN en el ESP32-S3.
- Consulta PIDs OBD2 importantes en tiempo real.
- Decodifica metricas como RPM, velocidad, temperatura, throttle, combustible, MAF, MAP, voltaje ECU, DTCs y Mode 09.
- Envia un dashboard por UDP, configurable desde `data/config.ini`.
- Guarda una muestra binaria compacta cada N segundos, tambien configurable.
- Usa una particion raw circular para guardar alrededor de un mes a 10 segundos por muestra.

## Optimizacion de almacenamiento

El log no usa JSON, CSV ni texto dentro del ESP32. Cada registro mide exactamente 24 bytes y se escribe directo en una particion raw llamada `obdlog`.

Formato v1 por muestra:

- Magic `AS`
- Version
- `valid_mask`
- Secuencia
- `uptime_seconds`
- RPM
- Velocidad
- Coolant
- Throttle
- Fuel level
- Engine load
- MAP
- MAF
- ECU voltage
- CRC8

Retencion aproximada con la particion actual:

| Intervalo | Retencion |
| --- | ---: |
| 5 s | ~15.9 dias |
| 10 s | ~31.8 dias |
| 30 s | ~95.4 dias |

La particion usa sectores de 4096 bytes, 170 registros por sector y 274,720 registros utiles. El logger recupera la siguiente posicion escaneando la secuencia al arrancar, asi evita escribir metadata extra en flash.

## Configuracion

Las credenciales WiFi siguen en `src/config.h`, que no se sube a GitHub:

```bash
cp src/config.example.h src/config.h
```

Edita `src/config.h`:

```cpp
#define OBD_WIFI_SSID "TU_WIFI"
#define OBD_WIFI_PASS "TU_PASSWORD"

#define OBD_DASH_HOST_FIXED_OCTETS 192, 168, 31, 239
#define OBD_DASH_USE_BROADCAST true
```

Los parametros operativos estan en `data/config.ini`:

```ini
[logging]
enabled=true
interval_seconds=10
max_sample_age_seconds=15

[dashboard]
enabled=true
interval_ms=200

[serial]
diag_interval_ms=2000
```

Sube el `config.ini` al LittleFS:

```bash
pio run -t uploadfs
```

Con puerto explicito:

```bash
pio run -t uploadfs -e esp32-s3-devkitm-1 --upload-port /dev/cu.usbmodem1101
```

## Compilar y flashear

Desde esta carpeta:

```bash
pio run
pio run -t upload
```

Con puerto explicito:

```bash
pio run -t upload -e esp32-s3-devkitm-1 --upload-port /dev/cu.usbmodem1101
```

Ver diagnostico serial:

```bash
pio device monitor -p /dev/cu.usbmodem1101 -b 115200
```

Linea esperada:

```text
[diag] wifi=UP ... can=OK ... rsp/s=... decoded/s=... log=ON log_seq=...
```

`log_seq` debe subir cada `logging.interval_seconds` si hay datos OBD frescos.

## Ver dashboard UDP

Recomendado:

```bash
python3 tools/udp_terminal_client.py --port 3333
```

En esta Mac tambien puedes usar el Python del sistema si tu `python3` del PATH no muestra salida:

```bash
/usr/bin/python3 tools/udp_terminal_client.py --port 3333
```

Tambien puede funcionar:

```bash
nc -luk 3333
```

## Exportar el log

Exporta la particion raw a CSV usando el puerto serial:

```bash
python3 tools/dump_obd_log.py --port /dev/cu.usbmodem1101 --out output/obdlog.csv
```

Equivalente con el Python del sistema:

```bash
/usr/bin/python3 tools/dump_obd_log.py --port /dev/cu.usbmodem1101 --out output/obdlog.csv
```

Exportar solo las ultimas muestras validas:

```bash
python3 tools/dump_obd_log.py --port /dev/cu.usbmodem1101 --out output/obdlog.csv --limit 256
```

Guardar tambien el binario crudo:

```bash
python3 tools/dump_obd_log.py --port /dev/cu.usbmodem1101 --out output/obdlog.csv --keep-raw output/obdlog.bin
```

## Hardware probado

- Board PlatformIO: `esp32-s3-devkitm-1`
- Framework: Arduino
- Flash: 8 MB
- CAN transceiver: SN65HVD233 o compatible
- Pines CAN:
  - RX: `GPIO12`
  - TX: `GPIO13`
  - LBK/loopback transceiver: `GPIO14` en LOW
- Puerto dashboard UDP: `3333`
- Puerto local UDP del ESP32: `3334`

## Estructura relevante

```text
platformio.ini
partitions.csv
data/config.ini
src/
  app.cpp
  app_config.cpp
  config.example.h
  main.cpp
  obd_binary_logger.cpp
  obd_dashboard.cpp
  obd_service.cpp
tools/
  dump_obd_log.py
  udp_terminal_client.py
```

## Troubleshooting

Si no aparece dashboard:

- Confirma que la Mac y el ESP32 estan en la misma red WiFi.
- Usa `python3 tools/udp_terminal_client.py --port 3333`.
- Revisa serial y confirma `wifi=UP`, `udp_tx` subiendo y `udp_err=0`.

Si no hay datos OBD:

- Confirma `can=OK`.
- Confirma `rsp/s > 0` y `decoded/s > 0`.
- Si `rsp/s=0`, el ESP32 no esta recibiendo respuestas del simulador.

Si no se guardan logs:

- Confirma `log=ON`.
- Confirma que `decoded/s > 0`.
- Revisa que `max_sample_age_seconds` no sea menor al tiempo real entre respuestas OBD.
- `log_seq` solo sube cuando hay al menos una metrica compacta fresca.

## Archivos que no se suben

- `.pio/`
- `src/config.h`
- `sdkconfig.*`
- `output/`
- logs y caches locales
