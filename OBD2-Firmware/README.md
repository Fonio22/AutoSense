# OBD2-Firmware

Firmware para ESP32-S3 que consulta datos OBD2 por CAN, muestra un dashboard ANSI por USB-CDC y guarda un historial binario compacto en la flash interna.

Flujo actual:

```text
Simulador/carro OBD2 -> CAN binario -> ESP32-S3 -> USB-CDC -> monitor serial
                                             -> BLE -> app movil
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

## Flujo completo paso a paso

Esta seccion explica el firmware como si fuera una linea de produccion: arranca, pregunta datos al carro, recibe bytes, los convierte a valores, guarda un resumen compacto, corre el detector de anomalias y manda una vista en vivo al celular.

### 1. Arranque del ESP32

El punto de entrada es pequeno:

```text
main.cpp -> setup() -> appSetup()
main.cpp -> loop()  -> appLoop()
```

`appSetup()` hace esto:

1. Abre `Serial` a 115200 baudios para el dashboard por USB.
2. Configura LEDs y el pin `GPIO14` del transceiver CAN en modo normal.
3. Inicializa `ObdService`, `UdsVagScanner`, dashboard, logger binario, detector de anomalias y BLE.
4. Lee `data/config.ini` desde LittleFS (`configfs`).
5. Carga `/active_profile.json` si la app ya habia aplicado un perfil de vehiculo.
6. Imprime la politica de solo lectura.
7. Abre CAN en `GPIO12` RX, `GPIO13` TX, 500000 baudios.
8. Empieza a anunciar BLE como `AutoSense OBD2`.

Despues de eso `appLoop()` corre una vuelta muy corta muchas veces por segundo. En cada vuelta llama a:

```text
OBD.tick()              -> decide que solicitud OBD2 enviar
BLE_PROTO.tick()        -> manda telemetria al celular si hay streaming activo
VAG.tick()              -> escaneo UDS/VAG solo si el perfil lo permite
processCanFrames()      -> procesa respuestas CAN recibidas
LOGGER.tick()           -> guarda una muestra binaria si toca por tiempo
processAnomaly()        -> corre IA local si toca por tiempo
DASH.tick()             -> refresca pantalla USB si toca por tiempo
```

### 2. Los datos vienen en binario, no en texto

En el bus CAN no viaja JSON, CSV ni texto. Viajan bytes. Cuando ves algo como `02 01 0C`, eso es hexadecimal escrito para humanos, pero en memoria son 3 bytes binarios:

```text
0x02 0x01 0x0C
```

Ejemplo para pedir RPM:

```text
CAN ID: 0x7DF
DATA:   02 01 0C 00 00 00 00 00
```

Significado:

| Byte | Valor | Significado |
| --- | --- | --- |
| 0 | `02` | hay 2 bytes utiles despues de este byte |
| 1 | `01` | OBD Mode 01, datos actuales |
| 2 | `0C` | PID RPM |
| 3-7 | `00` | relleno del frame CAN |

Una ECU puede responder:

```text
CAN ID: 0x7E8
DATA:   04 41 0C 2E E0 00 00 00
```

Significado:

| Byte | Valor | Significado |
| --- | --- | --- |
| 0 | `04` | hay 4 bytes utiles despues de este byte |
| 1 | `41` | respuesta positiva a Mode 01 (`0x01 + 0x40`) |
| 2 | `0C` | respuesta del PID RPM |
| 3 | `2E` | byte A |
| 4 | `E0` | byte B |

La formula OBD2 de RPM es:

```text
RPM = ((A * 256) + B) / 4
RPM = ((0x2E * 256) + 0xE0) / 4
RPM = 3000
```

El firmware imprime bytes crudos en hexadecimal para debug (`RAW` en dashboard), pero para trabajar internamente usa numeros: `rpm=3000`, `speedKph=88`, `coolantC=91`, etc.

### 3. Como decide que preguntar al carro

Al arrancar, `ObdService` no asume que todos los PIDs existen. Primero hace discovery de PIDs soportados:

```text
0100, 0120, 0140, 0160, 0180, 01A0, 01C0
```

Cada respuesta trae un bitmap de 32 bits. Cada bit dice si un PID existe. Por ejemplo, la respuesta de `0100` dice que PIDs entre `01` y `20` puede consultar el firmware.

El firmware reconstruye su plan de consulta asi:

1. Si hay perfil activo, usa los PIDs del perfil.
2. Si no hay perfil activo, usa los PIDs descubiertos por bitmap.
3. Si todavia no sabe nada, usa una lista fallback segura de PIDs comunes.

Hay dos carriles de consulta:

| Carril | Intervalo | Uso |
| --- | ---: | --- |
| Key lane | 50 ms | PIDs importantes como RPM, velocidad, coolant, throttle, combustible, MAF, MAP y voltaje |
| Background lane | 350 ms | PIDs menos criticos descubiertos por el carro |

No significa que cada PID se lea cada 50 ms. Significa que cada 50 ms se manda una solicitud del carril rapido y el cursor avanza al siguiente PID. Si hay 10 PIDs rapidos, cada uno vuelve aproximadamente cada 500 ms.

Ademas hay consultas de diagnostico de solo lectura:

| Consulta | Intervalo default | Que lee |
| --- | ---: | --- |
| Mode 09 | 3 s | VIN, CALID, CVN, ECU name, IPT si responde |
| Mode 06 | 10 s | monitores onboard de emisiones/motor |
| Mode 03 | 15 s | DTCs stored |
| Mode 07 | 20 s | DTCs pending |
| Mode 02 | 25 s | freeze frame raw |
| Mode 0A | 30 s | DTCs permanent |

Cada 30 s se repite el discovery de PIDs soportados, porque algunos carros tardan en responder o cambian que ECUs contestan.

### 4. Como recibe y decodifica respuestas

`processCanFrames()` lee todos los frames disponibles desde `CAN0`. Cada frame se pasa a:

```text
OBD.handleFrame(frame, nowMs)
VAG.handleFrame(frame, nowMs)
```

`OBD.handleFrame()` filtra respuestas OBD normales:

```text
0x7E8..0x7EF       respuestas CAN 11-bit normales
0x18DAF1xx         respuestas CAN extendidas 29-bit
```

Luego revisa el servicio:

| Respuesta | Significado |
| --- | --- |
| `0x41` | respuesta Mode 01, datos actuales |
| `0x42` | respuesta Mode 02, freeze frame |
| `0x43` | respuesta Mode 03, DTC stored |
| `0x46` | respuesta Mode 06 |
| `0x47` | respuesta Mode 07, DTC pending |
| `0x49` | respuesta Mode 09 |
| `0x4A` | respuesta Mode 0A, DTC permanent |

Para Mode 01, el firmware hace tres cosas:

1. Guarda los bytes crudos en `ObdMetric.raw` como texto hex para el dashboard.
2. Decodifica el PID con su formula.
3. Si el PID es importante para IA/logging, actualiza `ObdCompactSample`.

Ejemplos de formulas usadas:

| PID | Campo | Formula |
| --- | --- | --- |
| `0C` | RPM | `((A*256)+B)/4` |
| `0D` | velocidad | `A` km/h |
| `05` | coolant | `A-40` C |
| `11` | throttle | `A*100/255` % |
| `2F` | fuel level | `A*100/255` % |
| `04` | engine load | `A*100/255` % |
| `0B` | MAP | `A` kPa |
| `10` | MAF | `((A*256)+B)/100` g/s |
| `42` | voltaje ECU | `((A*256)+B)/1000` V |
| `0F` | intake air | `A-40` C |
| `0E` | spark advance | `A/2-64` grados |

### 5. Que es `ObdCompactSample`

`ObdCompactSample` es la version pequena de los datos. No contiene todo el dashboard, solo las senales que sirven para historial, BLE e IA:

| Bit `validMask` | Senal | Tipo interno |
| ---: | --- | --- |
| 0 | RPM | `uint16_t rpm` |
| 1 | velocidad | `uint8_t speedKph` |
| 2 | coolant | `int16_t coolantC` |
| 3 | throttle | `uint8_t throttlePct` |
| 4 | fuel level | `uint8_t fuelLevelPct` |
| 5 | engine load | `uint8_t engineLoadPct` |
| 6 | MAP | `uint8_t mapKpa` |
| 7 | MAF | `uint16_t mafCentiGps` |
| 8 | voltaje ECU | `uint16_t ecuMv` |
| 9 | intake air | `int16_t intakeAirC` |
| 10 | spark advance | `int16_t sparkAdvanceDeg10` |

`validMask` existe porque no todas las muestras tienen todas las senales. Si RPM llego hace 1 segundo pero MAF no llega hace 20 segundos, RPM queda valida y MAF no.

Para logging e IA, `appLoop()` llama:

```text
OBD.collectCompactSample(nowMs, loggingMaxSampleAgeSeconds * 1000, &compactSample)
```

Con la configuracion actual, una senal cuenta como valida si se actualizo en los ultimos 15 segundos.

### 6. Como guarda el historial en flash

El historial no se guarda en hexadecimal. Se guarda como binario puro en la particion raw `obdlog`.

Particion actual:

```text
obdlog offset 0x1A0000 size 0x650000
```

Formato de cada registro v1:

| Campo | Bytes | Nota |
| --- | ---: | --- |
| magic | 2 | siempre `AS` |
| version | 1 | version del formato, hoy `1` |
| validMask | 2 | bits de senales presentes |
| sequence | 4 | contador creciente |
| uptimeSeconds | 4 | segundos desde arranque |
| rpm | 2 | RPM entero |
| speedKph | 1 | km/h |
| coolantRaw | 1 | `coolantC + 40` |
| throttlePct | 1 | porcentaje entero |
| fuelLevelPct | 1 | porcentaje entero |
| engineLoadPct | 1 | porcentaje entero |
| mapKpa | 1 | kPa |
| mafGps | 1 | MAF redondeado a g/s |
| ecuVoltageDecivolts | 1 | voltaje en decivoltios, por ejemplo 138 = 13.8 V |
| crc8 | 1 | checksum del registro |

Total: 24 bytes exactos por muestra.

Detalles importantes:

- Los campos multi-byte se escriben en little-endian, como el ESP32. `tools/dump_obd_log.py` los lee con formato Python `<2sBHIIH8BB`.
- El logger escribe cada `logging.interval_seconds`, por defecto 10 s.
- Solo escribe si hay al menos una senal valida (`validMask != 0`).
- Cada sector flash mide 4096 bytes. Caben 170 registros de 24 bytes; quedan 16 bytes sin usar por sector.
- Al llegar al inicio de un sector, borra el sector completo antes de escribir.
- Cuando llena la particion, vuelve al inicio: es un log circular.
- Al arrancar, escanea los registros existentes, busca el mayor `sequence` valido y sigue desde la siguiente posicion.
- El CRC8 evita aceptar registros cortados o corruptos.

Capacidad actual:

```text
sectorCount = 0x650000 / 4096 = 1616 sectores
capacity    = 1616 * 170 = 274720 registros
```

Con 10 s por registro, eso da unos 31.8 dias de historial. Con 5 s, unos 15.9 dias.

Limitacion actual del formato v1: `ObdCompactSample` tiene 11 senales, pero el log binario v1 guarda fisicamente 9 campos principales: RPM, velocidad, coolant, throttle, fuel, engine load, MAP, MAF y voltaje. Intake air y spark advance se usan para BLE/IA si estan presentes, pero no se exportan desde `dump_obd_log.py` en el formato v1.

### 7. Como corre la IA local

La IA local vive en:

```text
obd_anomaly_detector.cpp
tiny_isolation_forest.cpp
```

No pregunta datos nuevos al carro. Usa el mismo `ObdCompactSample` que ya fue recolectado por OBD.

Por defecto:

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

Eso significa:

- Intenta correr una inferencia cada 10 s.
- Necesita datos validos recientes.
- Primero aprende una linea base del carro.
- Guarda estado cada 300 s si hubo cambios.
- Combina 70% Z-score y 30% Isolation Forest cuando el modelo ya esta listo.

El flujo interno es:

```text
ObdCompactSample
  -> ObdSample
  -> detectar contexto de manejo
  -> actualizar o consultar baseline
  -> calcular Z-score por senal
  -> normalizar senales
  -> Isolation Forest si ya esta entrenado
  -> combinar score
  -> aplicar debounce
  -> guardar ultimo AnomalyResult
```

Contextos de manejo:

| Contexto | Regla simplificada |
| --- | --- |
| `IDLE` | velocidad <= 2 km/h y RPM entre 450 y 1200 |
| `ACCELERATING` | sube velocidad >= 3 km/h o RPM >= 250 contra muestra previa |
| `DECELERATING` | baja velocidad >= 3 km/h contra muestra previa |
| `CRUISING` | velocidad > 10 km/h sin aceleracion fuerte |
| `UNKNOWN` | faltan RPM/velocidad o no hay suficiente historial |

El baseline usa Welford, que es una forma estable de calcular promedio y desviacion estandar sin guardar todas las muestras. Guarda estadisticas globales y por contexto. Una senal se compara contra el contexto si ese contexto ya tiene suficientes datos; si no, usa el baseline global.

El Z-score responde esta pregunta:

```text
que tan lejos esta este valor de lo normal para este carro?
```

Formula conceptual:

```text
z = abs(valor_actual - promedio) / desviacion_estandar
```

El firmware usa un piso minimo de desviacion estandar por senal para evitar falsos positivos cuando una senal casi no varia. Ejemplo: RPM nunca usa una desviacion menor a 80 RPM; voltaje nunca usa menos de 0.10 V.

Luego convierte el conjunto de Z-scores a un score 0..100:

```text
zScore = clamp(rms(z_scores) * 12.5, 0, 100)
```

El Isolation Forest es pequeno:

| Parametro | Valor |
| --- | ---: |
| arboles | 16 |
| sample size | 64 |
| ring buffer | 128 muestras |
| profundidad maxima | 6 |
| nodos maximos por arbol | 127 |

No usa memoria dinamica para inferencia. Entrena con muestras normales y estables (`IDLE` o `CRUISING`) cuando el baseline ya esta listo. Si todavia no esta listo, el score final usa solo Z-score.

Severidad:

| Score | Severidad cruda |
| ---: | --- |
| 0..34.9 | `NORMAL` |
| 35..64.9 | `WATCH` |
| 65..84.9 | `WARNING` |
| 85..100 | `CRITICAL` |

Debounce:

- Una muestra rara puede subir a `WATCH`.
- Para reportar `WARNING` o `CRITICAL`, hacen falta 3 muestras fuertes dentro de una ventana de 5 inferencias.
- Con `interval_seconds=10`, una alerta fuerte tarda normalmente unos 30 s de persistencia.
- Cuando vuelve a normal, baja de severidad gradualmente en vez de saltar directo a normal.

### LED de estado

El LED ya no indica "estoy enviando". Indica salud del sistema:

| Estado | Color | Significado |
| --- | --- | --- |
| `NORMAL` | verde | sistema sano |
| `WATCH` | verde | vigilancia leve, no alarma |
| `WARNING` | rojo | anomalía detectada |
| `CRITICAL` | rojo | anomalía crítica |
| CAN no levantado | rojo | enlace OBD2 caído |

Durante el arranque, el pulso inicial es verde si CAN levanta sin fallo; si no, queda rojo. El heartbeat de 1 Hz usa la severidad ya debounced, no el tráfico de envío.

Tiempo aproximado de aprendizaje default:

| Etapa | Tiempo aproximado |
| --- | ---: |
| Baseline minimo, 300 muestras cada 10 s | 50 min |
| Ring de Isolation Forest, 64 muestras normales extra | 10.7 min |
| Entrenar 16 arboles, 1 paso por inferencia | 2.7 min |

En condiciones ideales, el modelo completo puede estar listo alrededor de 1 hora despues de empezar a recibir datos estables. Si el carro esta apagado, faltan PIDs o el manejo es muy variable, tarda mas.

El detector no dice "cambia esta pieza". Entrega:

| Campo | Significado |
| --- | --- |
| `score` | 0..100, que tan anomalo se ve |
| `severity` | `NORMAL`, `WATCH`, `WARNING`, `CRITICAL` |
| `areaMask` | area probable: motor, admision, combustible, electrico, temperatura, conduccion o sensor |
| `topSignals` | hasta 3 senales que mas se alejaron del baseline |
| `baselineReady` | ya hay baseline suficiente |
| `modelReady` | Isolation Forest ya esta entrenado |

### 8. Como manda datos al celular

El firmware usa BLE GATT con un servicio propio:

| Elemento | UUID |
| --- | --- |
| Servicio | `6f2d0001-5f9b-4b56-9f51-8f7f4a3a1001` |
| RX, app escribe al ESP32 | `6f2d0002-5f9b-4b56-9f51-8f7f4a3a1001` |
| TX, ESP32 notifica a la app | `6f2d0003-5f9b-4b56-9f51-8f7f4a3a1001` |

Comandos soportados:

| Comando | Uso |
| --- | --- |
| `GET_DEVICE_INFO` | version de firmware, hardware y tamano maximo de chunk |
| `READ_VIN` | devuelve VIN si Mode 09 ya lo obtuvo |
| `GET_ACTIVE_PROFILE` | perfil activo y SHA-256 |
| `START_PROFILE_TRANSFER` | empieza envio de perfil desde app |
| `PROFILE_CHUNK` | chunk base64 del JSON de perfil |
| `END_PROFILE_TRANSFER` | valida tamano y SHA-256 |
| `APPLY_PROFILE` | guarda y activa el perfil |
| `GET_SUPPORTED_PIDS` | lista corta de PIDs soportados |
| `START_STREAM` | activa telemetria en vivo |
| `STOP_STREAM` | apaga telemetria en vivo |

La app usa `react-native-ble-plx`, que representa los valores BLE como base64 en JavaScript. Eso no significa que el firmware trabaje en base64 para telemetria normal. El firmware manda JSON como bytes; la libreria movil lo entrega base64 a JS y la app lo decodifica.

Cuando la app manda `START_STREAM`, el ESP32 envia `TELEMETRY` cada 1000 ms:

```json
{
  "command": "TELEMETRY",
  "ok": true,
  "data": {
    "speed": 88,
    "rpm": 2350,
    "engineTemp": 91,
    "fuelLiters": 34.2,
    "engineLoad": 36,
    "voltage": 13.8,
    "throttle": 18,
    "intakeTemp": 24,
    "validMask": 511,
    "anomaly": {
      "score": 72.4,
      "severity": "WARNING",
      "areaMask": 8,
      "baselineReady": true,
      "modelReady": true
    }
  }
}
```

Detalles:

- BLE transmite una vista en vivo cada 1 s.
- El modelo de anomalias no corre cada 1 s; por defecto corre cada 10 s.
- Por eso la app puede recibir el mismo resultado de anomalia durante varias notificaciones BLE.
- BLE solo usa datos con edad maxima de 5 s para la telemetria en vivo.
- `fuelLiters` se calcula como `fuelLevelPct * 0.6`. Es una aproximacion que asume tanque de 60 L.
- La app convierte `WARNING` o `CRITICAL` en alerta visual. El firmware solo envia score/severidad/area, no una reparacion definitiva.

### 9. Resumen de tiempos default

| Proceso | Default | Donde se define |
| --- | ---: | --- |
| Consulta key lane | 50 ms por solicitud | `obd_service.cpp` |
| Consulta background | 350 ms por solicitud | `obd_service.cpp` |
| Dashboard USB | 1000 ms | `dashboard.interval_ms` |
| BLE stream | 1000 ms | `obd_ble_protocol.cpp` |
| Guardado binario | 10 s | `logging.interval_seconds` |
| IA local | 10 s | `anomaly.interval_seconds` |
| Guardar baseline/modelo | 300 s | `anomaly.save_interval_seconds` |
| Mode 09 | 3 s | `obd_service.cpp` |
| Mode 06 | 10 s | `obd_service.cpp` |
| Mode 03 | 15 s | `obd_service.cpp` |
| Mode 07 | 20 s | `obd_service.cpp` |
| Mode 02 | 25 s | `obd_service.cpp` |
| Mode 0A | 30 s | `obd_service.cpp` |

### 10. Que no hace

- No borra codigos de falla.
- No reinicia TPMS.
- No calibra modulos.
- No escribe codificaciones.
- No hace output tests ni actuator tests.
- No diagnostica una pieza exacta; marca patrones raros y areas probables.
- No guarda todo el dashboard en flash; guarda un resumen binario compacto.

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
VehicleProfile   -> perfil JSON activo aplicado por la app movil
UdsVagScanner    -> VW/VAG extendido solo lectura, activado por perfil con extendedReadOnly
ObdDashboard     -> vista serial de metricas, VIN, DTCs y estado del guard
ObdBinaryLogger  -> historial compacto en flash
tools/           -> captura de reportes y exportacion del log binario
```

Flujo actual de perfiles:

1. El ESP32 intenta leer VIN con OBD Mode 09.
2. La app movil puede usar ese VIN para resolver/descargar un perfil.
3. La app envia el perfil al ESP32 por BLE en chunks.
4. El ESP32 valida tamano, SHA-256, JSON, formulas permitidas y servicios seguros.
5. Si pasa validacion, guarda `/active_profile.json` en LittleFS y reinicia el plan de polling.

El firmware actual no lee una clave `vag.force_profile`. Para activar VW/VAG extendido hacen falta dos condiciones: `vag.enabled=true` en `data/config.ini` y un perfil activo que contenga `extendedReadOnly`, como `vw_passat_2016`.

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

Cuando `vag.enabled=true` y el perfil activo contiene `extendedReadOnly`, el firmware activa `UdsVagScanner`. El VIN ayuda a la app a elegir el perfil, pero el ESP32 no activa VAG solo por prefijo de VIN. Este scanner usa ISO-TP basico sobre CAN 11-bit y solo manda servicios UDS permitidos por el guard:

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
```

Ademas, aplica desde la app un perfil que contenga `extendedReadOnly`, por ejemplo `vw_passat_2016`. Solo cambiar `vag.enabled=true` no basta si no hay perfil activo.

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
```

Interpretacion:

- `logging.interval_seconds=10` guarda una muestra historica cada 10 segundos.
- `dashboard.interval_ms=1000` refresca la vista en vivo una vez por segundo.
- `dashboard.ebook_mode=true` activa la salida ANSI completa por cable.
- `obd.diagnostic_info_enabled=true` permite Mode 02/03/06/07/0A de solo lectura. Mode 09/VIN se mantiene para perfil.
- `vag.enabled=true` permite el scanner VW/VAG extendido, pero solo se ejecuta si el perfil activo trae `extendedReadOnly`. Si vas a hacer una primera prueba conservadora en otro carro, ponlo en `false`.

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
[boot] config=ini profile=... profile_fs=... log=ready log_capacity=... interval=10s anomaly=on/10s save=300s min=300 dashboard=on/1000ms ebook=on obd_diag=on vag_ext=on transport=USB-CDC+BLE
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
