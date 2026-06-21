# OBD2-Firmware

Firmware para ESP32-S3 que consulta datos OBD2 por CAN, muestra un dashboard ANSI por USB-CDC y guarda un historial binario compacto en la flash interna.

Flujo actual:

```text
Simulador OBD2 -> CAN -> ESP32-S3 -> USB-CDC -> monitor serial en la Mac
                                    -> flash interna -> log binario circular
```

## Que hace

- Inicializa CAN y el dashboard por cable en el ESP32-S3.
- Hace discovery dinamico de PIDs Mode 01 soportados con `0100`, `0120`, `0140`, `0160`, `0180`, `01A0` y `01C0` cuando responden.
- Consulta PIDs OBD2 soportados en tiempo real, no solo una lista fija de 10-12 PIDs.
- Decodifica metricas como RPM, velocidad, temperatura, throttle, combustible, fuel trims, O2/lambda, MAF, MAP, voltaje ECU, readiness, MIL y Mode 09.
- Lee DTCs sin borrar: Mode 03 stored, Mode 07 pending y Mode 0A permanent.
- Lee raw seguro de Mode 02 freeze frame y Mode 06 onboard monitoring.
- Muestra un dashboard ANSI por USB-CDC.
- Guarda una muestra binaria compacta cada N segundos en una particion raw.
- Analiza anomalias localmente con baseline por vehiculo, Z-score e Isolation Forest pequeno.
- Evita JSON, CSV y texto dentro del ESP32 para el historial.
- Usa `dashboard.interval_ms` para la vista en vivo y `logging.interval_seconds` para el guardado historico.

## Solo lectura primero

Este firmware esta preparado para pruebas en un carro real en modo solo lectura. Todo frame de diagnostico que sale por CAN pasa por `ObdReadOnlyGuard` antes de `CAN0.sendFrame()`. Si un servicio no esta en `SAFE_READ`, se bloquea por defecto y se registra por serial con `[readOnlyGuard] BLOCK ...`.

`SAFE_READ` actual:

| Familia | Servicios permitidos |
| --- | --- |
| OBD2 estandar | `01` current data, `02` freeze frame, `03` stored DTC, `06` onboard monitoring, `07` pending DTC, `09` vehicle info, `0A` permanent DTC |
| UDS | `19` ReadDTCInformation, `22` ReadDataByIdentifier |

`BLOCKED_WRITE_RISK` actual:

| Familia | Servicios bloqueados |
| --- | --- |
| OBD2 estandar | `04` clear/reset emissions data, `08` control operation |
| UDS | `10`, `11`, `14`, `23`, `27`, `28`, `2A`, `2C`, `2E`, `2F`, `31`, `34`, `35`, `36`, `37`, `38`, `3D`, `3E`, `83`, `85`, `87` |

Reglas de seguridad:

- No se borra DTC. `Mode 04` esta bloqueado.
- No se hace TPMS reset, calibration, relearn, coding, adaptation, basic settings, output tests, service reset ni actuator tests.
- No se usa SecurityAccess, RoutineControl, IOControl, WriteDataByIdentifier, WriteMemoryByAddress ni transfer/download/upload.
- No se hace dump de memoria ECU. Por eso UDS `0x23 ReadMemoryByAddress` queda bloqueado aunque sea una lectura.
- Si hay duda, el comando se bloquea.

Al arrancar, el firmware imprime por USB:

```text
[readOnlyGuard] SAFE_READ:
[readOnlyGuard] BLOCKED_WRITE_RISK:
```

En el dashboard aparece `guard_blocked=N`. En uso normal debe quedarse en `0`.

Auditoria local antes de flashear:

```bash
python3 tools/audit_read_only_policy.py
```

Salida esperada:

```text
READ-ONLY POLICY AUDIT OK
SAFE_OBD: 0x01, 0x02, 0x03, 0x06, 0x07, 0x09, 0x0A
SAFE_UDS: 0x19, 0x22
BLOCKED_OBD: 0x04, 0x08
BLOCKED_UDS: 0x10, 0x11, 0x14, 0x23, 0x27, 0x28, 0x2A, 0x2C, 0x2E, 0x2F, 0x31, 0x34, 0x35, 0x36, 0x37, 0x38, 0x3D, 0x3E, 0x83, 0x85, 0x87
```

Si esta auditoria falla, no flashees el firmware al carro.

## Discovery y perfiles

La arquitectura esta separada para preparar perfiles por vehiculo sin endurecer el firmware a un solo carro:

```text
ObdReadOnlyGuard -> bloqueo/allowlist de seguridad
ObdService       -> discovery OBD2, scheduler, decoders y VIN
VehicleProfile   -> perfil inferido por VIN, por ahora generic o vw-vag
UdsVagScanner    -> VW/VAG extendido solo lectura, activado por perfil
ObdDashboard     -> vista serial de metricas, VIN, DTCs y estado del guard
ObdBinaryLogger  -> historial compacto en flash
tools/           -> captura de reportes y exportacion del log binario
```

Por ahora el perfil se infiere por VIN:

- `WVW`, `3VW`, `1VW` => `vw-vag`
- cualquier otro VIN => `generic`

Esto no activa escrituras ni codificaciones. En una iteracion futura la app movil podra elegir o descargar un perfil por marca/modelo, pero el guard seguira siendo obligatorio.

Si el carro es VW/VAG conocido pero no entrega VIN por OBD Mode 09, puedes activar el perfil manualmente con `vag.force_profile=true` en `data/config.ini`. Ese override solo habilita el scanner extendido de lectura; no desbloquea servicios de escritura.

## Anomaly detector local

El detector vive en `obd_anomaly_detector.*` y consume solo el `ObdCompactSample` que ya usa el logger. No manda solicitudes OBD nuevas, no escribe ECUs y no cambia el formato del log binario.

Pipeline:

- Warmup/calibracion: Welford por senal y contexto de manejo (`IDLE`, `CRUISING`, `ACCELERATING`, `DECELERATING`, `UNKNOWN`).
- Z-score: compara cada senal contra su baseline local, con piso de desviacion estandar y thresholds por senal.
- Tiny Isolation Forest: 16 arboles, sample size 64, max depth 6, nodos estaticos e inferencia sin memoria dinamica.
- Debounce: una muestra aislada sube a `WATCH`; para `WARNING/CRITICAL` se requieren patrones persistentes.
- Explicacion: top 3 senales y area probable: motor, admision, combustible, electrico/bateria, temperatura, conduccion o sensores.

Config default:

```ini
[anomaly]
enabled=true
interval_seconds=10
min_samples=300
save_interval_seconds=300
z_weight=70
iforest_weight=30
debug_logs=false
```

Persistencia:

- Baseline compacto en NVS namespace `obd_anom`.
- Modelo Isolation Forest en `configfs:/anomaly_iforest.bin`.
- Se invalida si cambia firmware, perfil activo o mascara de sensores.
- Se guarda por lotes cada 5 minutos para evitar desgaste de flash.

API interna:

```cpp
AnomalyResult obd_anomaly_process_sample(const ObdSample& sample);
bool obd_anomaly_is_model_ready();
void obd_anomaly_reset_baseline();
void obd_anomaly_save_state();
void obd_anomaly_load_state();
```

Self-check host:

```bash
g++ -std=c++17 -I src \
  tools/anomaly_selftest.cpp \
  src/obd_anomaly_detector.cpp src/tiny_isolation_forest.cpp \
  -o /tmp/anomaly_selftest && /tmp/anomaly_selftest
```

Limitaciones: esto marca patrones raros y areas posibles a revisar; no es diagnostico definitivo. Para autos nuevos o perfiles recien aplicados, espera `min_samples` antes de alertas fuertes.

## VW/VAG extendido solo lectura

Cuando el VIN detecta `vw-vag` y `vag.enabled=true`, el firmware activa `UdsVagScanner`. Si el VIN no llega pero sabes que el carro es VW/VAG, usa `vag.force_profile=true`. Este scanner usa ISO-TP basico sobre CAN 11-bit y solo manda servicios UDS permitidos por el guard:

| Servicio | Uso |
| --- | --- |
| `0x22 ReadDataByIdentifier` | identificacion de modulo: part number, SW/HW, supplier, VIN/system name si responde |
| `0x19 ReadDTCInformation` | DTCs por modulo con status mask y snapshot IDs raw |

DIDs de identificacion intentados:

| DID | Significado |
| --- | --- |
| `F187` | part number fabricante |
| `F188` | ECU software number |
| `F189` | ECU software version |
| `F18A` | supplier |
| `F190` | VIN |
| `F191` | ECU hardware number |
| `F197` | system/engine name |

Modulos candidatos:

| Address | Modulo | CAN req/resp principal |
| --- | --- | --- |
| `01` | Engine | `0x7E0/0x7E8` |
| `02` | Trans | `0x7E1/0x7E9` |
| `03` | ABS | `0x713/0x77D` |
| `08` | HVAC | `0x746/0x7B0` |
| `09` | BCM/Central Elect | `0x70E/0x778` |
| `15` | Airbag | `0x715/0x77F` |
| `17` | Instruments | `0x714/0x77E` |
| `19` | Gateway | `0x710/0x77A` |
| `44` | Steering Assist | `0x712/0x77C` |
| `46` | Comfort | `0x70D/0x777` |
| `53` | Parking Brake | `0x752/0x7BC` |
| `5F` | Infotainment | `0x773/0x7DD` |
| `65` | TPMS | `0x70B/0x775` |
| `16` | Steering Column | `0x70C/0x776` |

Notas:

- Cada modulo se prueba lento, con una solicitud cada ~1.2 s y timeout conservador.
- Si un modulo no responde por su ruta VW/VAG principal, se prueba una ruta UDS estandar `req+8` cuando aplica antes de declararlo no leido.
- Si una ruta no queda confirmada con `22 F187`, se prueba tambien `19 02 FF` y `22 F190` antes de saltar a la siguiente ruta/modulo.
- Si un modulo responde con UDS `responsePending` (`0x7F xx 0x78`), el scanner espera varias ventanas antes de avanzar.
- Los DTC UDS se muestran como `DTC24:status` en hex, no como descripcion inventada.
- Measuring values VAG/UDS quedan pendientes hasta tener mapa ODX/label/DID confiable para ese modulo. Leer DIDs desconocidos a ciegas no es util y puede saturar el gateway.
- No se manda `0x10`, `0x3E`, `0x14`, `0x2E`, `0x2F`, `0x31`, `0x27`, `0x28`, `0x85` ni ningun servicio fuera de `SAFE_READ`.

Mode 06 OBD estandar descubre bitmaps `0600/0620/...` y luego consulta TIDs soportados, guardando un resumen compacto `M06`. Esto ayuda a ver monitores onboard de emisiones/motor sin borrar fallas.

Mode 09 OBD estandar consulta `00`, `02`, `04`, `06`, `08`, `0A`, `0B` y `0C` cuando estan soportados. Eso permite mostrar VIN, CALID, CVN, ECU name e IPT raw si el vehiculo responde. El scheduler usa un intervalo corto para que estos campos aparezcan rapido sin interferir con la tabla OBD en vivo.

El dashboard separa hasta 4 responders Mode 09 por CAN ID en la tabla `Mode09 ECU`. En el Passat esto ayuda a distinguir datos de ECM/motor (`0x7E8`) y TCM/transmision (`0x7E9`) cuando ambos responden y antes se pisaban en una sola linea.

El scheduler ahora consulta Mode 09 cada 3 segundos. Mode 06 baja a 10 segundos para descubrir antes los TIDs soportados y capturar mas monitores onboard durante una prueba corta.

Si Engine o Trans no responden por UDS `0x22/0x19`, el dashboard ya no los trata igual que un modulo totalmente invisible cuando hay informacion OBD estandar: aparecen como `Leido por OBD: Engine, Trans (Mode09/Mode01)`. Para los demas modulos no leidos, la linea `No leido UDS` muestra la ruta CAN probada y el motivo, por ejemplo `Gateway@710>77A:timeout`.

Nota de protocolo: algunos Volkswagen/PQ pueden mezclar UDS ISO-TP con KWP2000 sobre VW TP2.0. TP2.0 abre un canal por `0x200` antes de intercambiar mensajes KWP, por eso no es lo mismo que mandar UDS directo a `0x710/0x77A`. Esta iteracion no activa TP2.0/KWP porque requeriria una politica de guard nueva para KWP y pruebas separadas; el firmware mantiene solo OBD2 estandar y UDS `0x19/0x22`.

## Passat 2016 y TPMS

Para Volkswagen Passat 2012-2017, la informacion de servicio publicada por Mitchell 1 describe el TPMS como indirecto e integrado en el modulo ABS. Eso significa:

- Normalmente no hay sensores de presion en las ruedas.
- No esperes PSI individual por OBD2 generico.
- Si hay luz TPMS junto con ABS/ESP, el origen probable puede estar en ABS o sensores de velocidad de rueda.
- El firmware solo debe leer fallas e identificacion; TPMS reset/calibration/relearn sigue prohibido.

Si el carro tuviera un modulo directo `65 TPMS`, solo se permitiria leer identificacion, DTCs y valores de medicion seguros cuando exista soporte UDS/VAG verificado. No se debe resetear ni calibrar.

## Matriz de alcance

| Grupo | Estado |
| --- | --- |
| A) OBD2 estandar confirmado | Mode 01 discovery/metricas, Mode 03 stored DTCs, Mode 07 pending DTCs, Mode 09 VIN/CALID/CVN, ECU name/IPT si responde, Mode 0A permanent DTCs |
| B) Soportado si responde | PIDs Mode 01 descubiertos hasta `01C0`, Mode 06 onboard monitoring, Mode 02 freeze frame |
| C) VW/VAG extendido | ISO-TP basico, identificacion por DID, DTCs por modulo y snapshot IDs raw usando solo UDS `0x22/0x19` |
| D) No disponible por OBD2 generico | ABS/airbag/body DTCs detallados si el gateway no enruta esos IDs, TPMS indirecto con estado por rueda, codificaciones, adaptaciones |
| E) Requiere mejor hardware | Escaneo VAG completo con ODX/label, gateways con varias redes CAN, DoIP/Ethernet si aplica, measuring values por modulo con mapa validado |
| F) Prohibido por seguridad | borrar DTCs, reset TPMS, calibration/relearn, coding, adaptation, basic settings, output tests, actuator tests, ECU reset, security access, memory dump |

## Prueba segura en carro real

Antes de probar con el Passat:

- Carro estacionado.
- Freno de mano activo.
- Primera prueba con ignition ON y motor OFF.
- Segunda prueba con motor encendido en parking/neutral.
- No manejar durante las primeras pruebas.
- Si `guard_blocked` sube, si hay errores CAN raros o si un modulo responde de forma inesperada, detener la prueba y revisar logs.

Secuencia recomendada:

```bash
python3 tools/audit_read_only_policy.py
pio run -e esp32-s3-devkitm-1
pio run -t uploadfs -e esp32-s3-devkitm-1 --upload-port /dev/cu.usbmodem101
pio run -t upload -e esp32-s3-devkitm-1 --upload-port /dev/cu.usbmodem101
pio device monitor -p /dev/cu.usbmodem101 -b 115200 -f direct
```

Captura de evidencia despues de verificar visualmente `guard_blocked=0`:

```bash
python3 tools/capture_obd_report.py \
  --port /dev/cu.usbmodem101 \
  --seconds 60 \
  --out output/passat_report.txt \
  --metrics-csv output/passat_obd_metrics.csv \
  --vag-csv output/passat_vag_modules.csv
```

`passat_obd_metrics.csv` contiene `mode`, `pid`, `supported`, `key`, `value`, `unit`, `hz`, `category`, `raw`, edad de actualizacion y notas. Si la captura incluye los bitmaps `0100/0120/...`, el CSV tambien agrega PIDs `supported=no` declarados como no soportados por el carro.

`passat_vag_modules.csv` contiene modulos VW/VAG vistos en el dashboard: address, nombre, estado, part/SW, DTC y ultimo error. `status=UP` significa que respondio UDS, `status=OBD` significa que Engine/Trans se pudieron identificar por OBD Mode09/Mode01 aunque no respondieran UDS, y `status=--` significa que esa ruta UDS no respondio o no fue accesible.

Para activar VW/VAG extendido despues de esa primera captura, cambia `data/config.ini`:

```ini
[vag]
enabled=true
force_profile=true
```

Usa `force_profile=true` solo cuando el vehiculo sea VW/VAG conocido y Mode 09 no devuelva VIN. Si el VIN ya detecta `vw-vag`, puedes dejar `force_profile=false`.

Luego sube solo LittleFS y reinicia:

```bash
pio run -t uploadfs -e esp32-s3-devkitm-1 --upload-port /dev/cu.usbmodem101
```

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

[obd]
diagnostic_info_enabled=true

[vag]
enabled=true
force_profile=true
```

Interpretacion:

- `logging.interval_seconds=10` guarda una muestra historica cada 10 segundos.
- `dashboard.interval_ms=1000` refresca la vista en vivo una vez por segundo.
- `dashboard.ebook_mode=true` activa la salida ANSI completa por cable.
- `obd.diagnostic_info_enabled=true` permite Mode 02/03/06/07/0A de solo lectura. Mode 09/VIN se mantiene para perfil.
- `vag.enabled=true` activa el scanner VW/VAG extendido. Si vas a hacer una primera prueba conservadora en otro carro, ponlo en `false`.
- `vag.force_profile=true` fuerza el perfil VW/VAG aunque el VIN tarde en llegar. Usalo solo para carros VW/VAG conocidos; si el VIN ya detecta `vw-vag`, puedes dejarlo en `false`.

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
pio device monitor -p /dev/cu.usbmodem101 -b 115200 -f direct
```

Importante: no uses `-f nocontrol` para el dashboard. Ese filtro elimina los codigos ANSI que limpian y reposicionan la pantalla; por eso parece que el dashboard baja haciendo scroll. Con `-f direct` el ESP32 borra la pantalla y redibuja la misma tabla una vez por segundo.

Linea esperada al arrancar:

```text
[boot] config=ini log=ready log_capacity=... interval=10s dashboard=on/1000ms ebook=on obd_diag=on vag_ext=on vag_force=on transport=USB-CDC
```

En pantalla deberias ver `ONE-SCREEN`, `link=USB-CDC`, `mode=EBOOK`, `can=UP`, `rsp/s > 0`, `decoded/s > 0` y `log seq` subiendo cada 10 segundos.

El dashboard es una sola pantalla fija. No rota pagina 1/2/3 y limpia la terminal en cada refresco. La tabla `OBD LIVE` muestra solo los PIDs importantes que realmente se pudieron leer; los valores no disponibles no ocupan filas y salen resumidos abajo en `No leido OBD`.

| Campo | Significado |
| --- | --- |
| `PID` | PID en hexadecimal |
| `DATO` | nombre corto |
| `VALUE` / `UNIT` | valor decodificado y unidad |
| `HZ` | frecuencia aproximada observada para ese PID |
| `RAW` | bytes crudos de la respuesta |
| `AGE` | edad de la ultima actualizacion |

Tambien veras lineas compactas:

- `DIAG STD`: DTC estandar Mode 03/07/0A, freeze frame y Mode 06 resumidos.
- `Mode09`: CALID/CVN resumidos, ECU name e IPT raw si el vehiculo declara esos PIDs soportados.
- `Mode09 ECU`: identidad por responder CAN ID para separar ECM, TCM u otras ECUs que contesten Mode 09.
- `VW/VAG leido`: solo modulos que respondieron, limitado para mantener una pantalla.
- `No leido OBD` y `No leido modulos`: resumen abajo lo que el carro/adaptador no entrego.
- `guard=0` si no se intento ningun comando bloqueado.

## Capturar reporte de diagnostico

Esta herramienta solo lee el dashboard serial y escribe un `.txt`; no envia comandos al ESP32 ni al carro:

```bash
python3 tools/capture_obd_report.py \
  --port /dev/cu.usbmodem1101 \
  --seconds 45 \
  --out output/passat_report.txt \
  --metrics-csv output/passat_obd_metrics.csv \
  --vag-csv output/passat_vag_modules.csv
```

Para el puerto usado antes:

```bash
python3 tools/capture_obd_report.py \
  --port /dev/cu.usbmodem101 \
  --seconds 45 \
  --out output/passat_report.txt \
  --metrics-csv output/passat_obd_metrics.csv \
  --vag-csv output/passat_vag_modules.csv
```

El resumen impreso debe incluir `guard_blocked=0`, VIN/perfil, Mode 02/06 raw y DTCs stored/pending/permanent si el vehiculo responde.

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

## Hardware recomendado

Para OBD2 estandar y pruebas iniciales, el ESP32-S3 con transceiver CAN sirve si `can=UP`, `rsp/s > 0` y `decoded/s > 0`.

Para VW/VAG extendido, si no aparecen modulos ABS/Gateway/Airbag/TPMS:

- Usa una interfaz VAG dedicada como VCDS HEX-V2/HEX-NET u OBDeleven para validar direcciones y DTCs.
- Usa un adaptador J2534/PassThru compatible con software OEM cuando necesites cobertura multi-red/gateway.
- Considera hardware con doble CAN o soporte DoIP/Ethernet si el gateway no enruta todas las redes al pin OBD de alta velocidad.
- Para investigacion profunda de measuring values, usa datos ODX/label verificados; no conviene consultar DIDs desconocidos a ciegas.

El firmware ESP32 mantiene modo solo lectura; cualquier herramienta externa usada para comparar debe configurarse tambien sin borrar fallas ni hacer output tests/adaptations/basic settings.

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
  obd_read_only_guard.cpp
  obd_service.cpp
  uds_vag_scanner.cpp
tools/
  audit_read_only_policy.py
  capture_obd_report.py
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
