# OBD-Firmware

Firmware para ESP32-S3 que consulta datos OBD2 por CAN y envia un dashboard ANSI por UDP para verlo en una terminal de la computadora.

Este proyecto no depende de la app Expo. El flujo actual es:

```text
Simulador OBD2 -> CAN -> ESP32-S3 -> WiFi UDP :3333 -> terminal en la Mac
```

## Que hace

- Inicializa WiFi y CAN en el ESP32-S3.
- Consulta PIDs OBD2 importantes en tiempo real.
- Decodifica metricas como RPM, velocidad, temperatura, throttle, MAF, MAP, voltaje ECU, DTCs y datos Mode 09.
- Renderiza una pantalla completa de terminal usando secuencias ANSI.
- Envia el dashboard por UDP cada ~200 ms.
- Usa broadcast UDP por defecto porque fue lo mas estable con la Mac y Ghostty.

## Hardware probado

- Board PlatformIO: `esp32-s3-devkitm-1`
- Framework: Arduino
- CAN transceiver: SN65HVD233 o compatible
- Pines CAN actuales:
  - RX: `GPIO12`
  - TX: `GPIO13`
  - LBK/loopback transceiver: `GPIO14` en LOW
- Puerto dashboard UDP: `3333`
- Puerto local UDP del ESP32: `3334`

## Estructura del proyecto

```text
platformio.ini
src/
  app.cpp              # WiFi, CAN, scheduler principal y envio dashboard
  app.h
  config.example.h    # plantilla de configuracion local
  main.cpp
  obd_dashboard.cpp   # renderer ANSI y envio UDP
  obd_dashboard.h
  obd_service.cpp     # consultas y decodificacion OBD2
  obd_service.h
tools/
  udp_terminal_client.py
README.md
```

## Configuracion local

La configuracion privada no se sube a GitHub. Antes de flashear, crea `src/config.h` desde la plantilla:

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

Notas:

- `OBD_DASH_USE_BROADCAST true` envia a la red local completa y fue lo que funciono mejor.
- Si quieres enviar solo a una IP fija, pon `OBD_DASH_USE_BROADCAST false` y ajusta `OBD_DASH_HOST_FIXED_OCTETS`.
- `src/config.h` esta ignorado por Git para no publicar credenciales.

## Instalar dependencias

Instala PlatformIO CLI si no lo tienes:

```bash
python3 -m pip install platformio
```

Las librerias CAN se instalan desde `platformio.ini`:

```ini
collin80/can_common
https://github.com/collin80/esp32_can.git
```

## Compilar

Desde esta carpeta:

```bash
cd OBD-Firmware
pio run
```

## Flashear el ESP32

Con el ESP32 conectado por USB:

```bash
pio run -t upload
```

Para ver diagnostico serial:

```bash
pio device monitor -b 115200
```

En el monitor serial debes ver lineas parecidas a:

```text
[diag] wifi=UP ... target=192.168.31.255 udp_tx=123 udp_err=0 can=OK route=7DF ...
```

## Ver el dashboard en terminal

Recomendado:

```bash
python3 tools/udp_terminal_client.py --port 3333
```

Tambien puede funcionar con `nc`, pero en esta Mac/Ghostty el cliente Python fue mas estable:

```bash
nc -luk 3333
```

Cuando funciona, la terminal se limpia y redibuja en vivo cada ~200 ms.

## Troubleshooting

Si no aparece nada:

- Confirma que la Mac y el ESP32 estan en la misma red WiFi.
- Usa el cliente Python: `python3 tools/udp_terminal_client.py --port 3333`.
- Revisa el monitor serial y confirma `wifi=UP`, `udp_tx` subiendo y `udp_err=0`.
- Si `udp_err` sube, revisa firewall/red o usa broadcast (`OBD_DASH_USE_BROADCAST true`).

Si el dashboard aparece pero los valores no cambian:

- Confirma que `can=UP`.
- Confirma que `rsp/s` y `decoded/s` son mayores que `0`.
- Si `rsp/s=0`, el ESP32 no esta recibiendo respuestas OBD del simulador.
- Si `rsp/s` sube pero un PID no cambia, revisa si ese PID esta siendo actualizado por el simulador.

Si cambias de WiFi o de computadora:

- Actualiza `src/config.h`.
- Si usas IP fija, cambia `OBD_DASH_HOST_FIXED_OCTETS`.
- Si usas broadcast, normalmente no hay que cambiar IP.

## Archivos que no se suben

Estos se ignoran por Git:

- `.pio/`
- `src/config.h`
- `sdkconfig.*`
- `output/`
- logs y cache de Python

Esto mantiene el repo limpio para GitHub y evita subir credenciales o archivos generados.
