# OBD2-Firmware

Firmware para ESP32-S3 que consulta datos OBD2 por CAN, muestra un dashboard ANSI por USB-CDC y guarda un historial binario compacto en la flash interna.

Flujo actual:

```text
Simulador OBD2 -> CAN -> ESP32-S3 -> USB-CDC -> monitor serial en la Mac
                                    -> flash interna -> log binario circular
```

## Que hace

- Inicializa CAN y el dashboard por cable en el ESP32-S3.
- Consulta PIDs OBD2 importantes en tiempo real.
- Decodifica metricas como RPM, velocidad, temperatura, throttle, combustible, MAF, MAP, voltaje ECU, DTCs y Mode 09.
- Muestra un dashboard ANSI por USB-CDC.
- Guarda una muestra binaria compacta cada N segundos en una particion raw.
- Evita JSON, CSV y texto dentro del ESP32 para el historial.
- Usa `dashboard.interval_ms` para la vista en vivo y `logging.interval_seconds` para el guardado historico.

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

Los parametros operativos estan en `data/config.ini`:

```ini
[logging]
enabled=true
interval_seconds=10
max_sample_age_seconds=15

[dashboard]
enabled=true
ebook_mode=true
interval_ms=1000
```

Interpretacion:

- `logging.interval_seconds=10` guarda una muestra historica cada 10 segundos.
- `dashboard.interval_ms=1000` refresca la vista en vivo una vez por segundo.
- `dashboard.ebook_mode=true` activa la salida ANSI completa por cable.

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

## Ver dashboard en vivo

El dashboard ya no usa UDP. Se ve directo por USB-CDC con el monitor serial:

```bash
pio device monitor -p /dev/cu.usbmodem1101 -b 115200
```

Linea esperada al arrancar:

```text
[boot] config=ini log=ready log_capacity=... interval=10s dashboard=on/1000ms ebook=on transport=USB-CDC
```

En pantalla deberias ver `link=USB-CDC`, `mode=EBOOK`, `can=OK`, `rsp/s > 0`, `decoded/s > 0` y `log_seq` subiendo cada 10 segundos.

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
- Transporte en vivo: USB-CDC por `Serial`

## Estructura relevante

```text
platformio.ini
partitions.csv
data/config.ini
src/
  app.cpp
  app_config.cpp
  obd_binary_logger.cpp
  obd_dashboard.cpp
  obd_service.cpp
tools/
  dump_obd_log.py
```

## Troubleshooting

Si no aparece el dashboard:

- Confirma que el monitor serial esta abierto en el puerto USB correcto.
- Revisa que el ESP32-S3 este flasheado con `ARDUINO_USB_CDC_ON_BOOT=1`.
- Confirma que `dashboard.enabled=true`.

Si no hay datos OBD:

- Confirma `can=OK`.
- Confirma `rsp/s > 0` y `decoded/s > 0`.
- Si `rsp/s=0`, el ESP32 no esta recibiendo respuestas del simulador.

Si no se guardan logs:

- Confirma `log=ON`.
- Confirma que `decoded/s > 0`.
- Revisa que `max_sample_age_seconds` no sea menor que el tiempo real entre respuestas OBD.
- `log_seq` solo sube cuando hay al menos una metrica compacta fresca.

## Archivos que no se suben

- `.pio/`
- `output/`
- logs y caches locales
