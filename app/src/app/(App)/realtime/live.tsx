import { useEffect, useRef } from 'react';
import {
  Activity,
  BatteryCharging,
  Gauge,
  Fuel,
  Thermometer,
  Wind,
  Zap,
  CircleCheck,
} from 'lucide-react-native';
import { Text, View, StyleSheet } from 'react-native';

import {
  AppScreen,
  CompactMetricCard,
  DetailHeader,
  ListRow,
  PENCIL,
  SurfaceCard,
} from '@/components/pencil-ui';
import { useSession } from '@/components/providers/session-provider';
import {
  setRealtimeConnectionState,
  updateDashboardFromTelemetry,
} from '@/lib/autosense-data';
import { backOrFallback } from '@/lib/navigation';
import { getActiveObdConnection } from '@/lib/obd/obd-device';
import { useObdTelemetry } from '@/lib/obd/use-obd-telemetry';
import { stopTripTracking, syncTripTracking } from '@/lib/trip-tracking';

export default function RealtimeLiveScreen() {
  const { firebaseUser, profile } = useSession();
  const isConnected = Boolean(getActiveObdConnection()) || (profile?.realtime?.isConnected ?? false);
  const demoMode = profile?.realtime?.deviceLabel === 'Demo OBD2';
  const telemetry = useObdTelemetry({ isConnected, demoMode });
  const isSyncing = useRef(false);
  const lastTripSyncMs = useRef(0);
  const lastDashboardSyncMs = useRef(0);
  const isImperial = profile?.settings?.speedUnit === 'mph';
  const useFahrenheit = profile?.settings?.temperatureUnit === '°F';
  const speedValue = isImperial
    ? Math.round(telemetry.speed * 0.621371)
    : telemetry.speed;
  const speedUnit = isImperial ? 'mph' : 'km/h';
  const engineTempValue = useFahrenheit
    ? Math.round((telemetry.engineTemp * 9) / 5 + 32)
    : telemetry.engineTemp;
  const intakeTempValue = useFahrenheit
    ? Math.round((telemetry.intakeTemp * 9) / 5 + 32)
    : telemetry.intakeTemp;
  const temperatureUnit = useFahrenheit ? '°F' : '°C';
  const hasEngineTemp = telemetry.engineTemp !== 0;
  const hasFuel = telemetry.fuelLiters > 0;
  const hasVoltage = telemetry.voltage > 0;
  const hasIntakeTemp = telemetry.intakeTemp !== 0;
  const anomalyLabel = telemetry.anomaly
    ? telemetry.anomaly.baselineReady
      ? `IA ${telemetry.anomaly.severity}`
      : 'IA calibrando'
    : 'IA no reportada';
  const metrics = [
    {
      title: 'Temp motor',
      value: hasEngineTemp ? `${engineTempValue}${temperatureUnit}` : '--',
      subtitle: hasEngineTemp && telemetry.engineTemp > 100 ? 'Alta' : hasEngineTemp ? 'Estable' : 'No disponible',
      icon: <Thermometer color={PENCIL.warning} size={16} strokeWidth={2.2} />,
      iconBackground: PENCIL.warningSoft,
      iconColor: PENCIL.warning,
    },
    {
      title: 'Combustible',
      value: hasFuel ? `${telemetry.fuelLiters.toFixed(1)} L` : '--',
      subtitle: hasFuel ? 'Lectura OBD2' : 'No disponible',
      icon: <Fuel color={PENCIL.success} size={16} strokeWidth={2.2} />,
      iconBackground: PENCIL.successSoft,
      iconColor: PENCIL.success,
    },
    {
      title: 'Carga motor',
      value: `${telemetry.engineLoad}%`,
      subtitle: telemetry.engineLoad >= 75 ? 'Alta' : 'Normal',
      icon: <Activity color={PENCIL.accent} size={16} strokeWidth={2.2} />,
      iconBackground: PENCIL.accentSoft,
      iconColor: PENCIL.accent,
    },
    {
      title: 'Voltaje ECU',
      value: hasVoltage ? `${telemetry.voltage.toFixed(1)}V` : '--',
      subtitle: hasVoltage ? 'Lectura OBD2' : 'No disponible',
      icon: <BatteryCharging color={PENCIL.success} size={16} strokeWidth={2.2} />,
      iconBackground: PENCIL.successSoft,
      iconColor: PENCIL.success,
    },
    {
      title: 'Acelerador',
      value: `${telemetry.throttle}%`,
      subtitle: 'Lectura OBD2',
      icon: <Gauge color={PENCIL.warning} size={16} strokeWidth={2.2} />,
      iconBackground: PENCIL.warningSoft,
      iconColor: PENCIL.warning,
    },
    {
      title: 'Aire admisión',
      value: hasIntakeTemp ? `${intakeTempValue}${temperatureUnit}` : '--',
      subtitle: hasIntakeTemp ? 'Lectura OBD2' : 'No disponible',
      icon: <Wind color={PENCIL.accent} size={16} strokeWidth={2.2} />,
      iconBackground: PENCIL.accentSoft,
      iconColor: PENCIL.accent,
    },
  ] as const;

  useEffect(() => {
    if (!firebaseUser?.uid || isSyncing.current) {
      return;
    }

    const now = Date.now();
    if (isConnected && now - lastTripSyncMs.current < 10000) {
      return;
    }
    lastTripSyncMs.current = now;
    isSyncing.current = true;

    void syncTripTracking(firebaseUser.uid, isConnected, telemetry)
      .catch((error) => {
        console.warn('[obd] trip sync failed', error);
      })
      .finally(() => {
        isSyncing.current = false;
      });
  }, [
    firebaseUser?.uid,
    isConnected,
    telemetry,
  ]);

  useEffect(() => {
    if (
      !firebaseUser?.uid
      || !isConnected
      || demoMode
      || !getActiveObdConnection()
    ) {
      return;
    }

    const hasRealTelemetry = telemetry.speed > 0
      || telemetry.rpm > 0
      || telemetry.engineTemp > 0
      || telemetry.fuelLiters > 0
      || telemetry.engineLoad > 0
      || telemetry.voltage > 0
      || telemetry.throttle > 0
      || telemetry.intakeTemp > 0;

    if (!hasRealTelemetry) {
      return;
    }

    const now = Date.now();
    if (now - lastDashboardSyncMs.current < 10000) {
      return;
    }

    lastDashboardSyncMs.current = now;
    void updateDashboardFromTelemetry(firebaseUser.uid, telemetry, profile)
      .catch((error) => {
        console.warn('[obd] dashboard telemetry sync failed', error);
      });
  }, [
    demoMode,
    firebaseUser?.uid,
    isConnected,
    profile,
    telemetry,
  ]);

  async function handleBack() {
    if (firebaseUser?.uid) {
      await stopTripTracking(firebaseUser.uid);
      await setRealtimeConnectionState(firebaseUser.uid, false);
    }
    await getActiveObdConnection()?.disconnect().catch(() => undefined);

    backOrFallback('/realtime');
  }

  return (
    <AppScreen
      contentTopPadding={8}
      header={(
        <DetailHeader
          onBack={() => {
            void handleBack();
          }}
          title="OBD2 en vivo"
        />
      )}
    >
      <View style={styles.page}>
        <SurfaceCard>
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.metricLabel}>Velocidad</Text>
                <Text style={styles.speedValue}>{speedValue}</Text>
                <Text style={styles.metricSubtitle}>{speedUnit}</Text>
              </View>

              <View style={styles.rpmCard}>
                <Text style={styles.metricLabel}>RPM</Text>
                <Text style={styles.rpmValue}>{telemetry.rpm}</Text>
                <Text style={styles.metricSubtitle}>Revoluciones</Text>
              </View>
            </View>

            <View style={styles.heroStatus}>
              <CircleCheck color={PENCIL.success} size={16} strokeWidth={2.2} />
              <Text style={styles.heroStatusText}>
                {demoMode
                  ? 'Modo demo: datos simulados'
                  : profile?.realtime?.statusLabel ?? 'Sensores conectados y transmitiendo'}
              </Text>
            </View>
          </View>
        </SurfaceCard>

        <View style={styles.metricGrid}>
          {metrics.map((metric) => (
            <CompactMetricCard
              key={metric.title}
              icon={metric.icon}
              iconBackground={metric.iconBackground}
              iconColor={metric.iconColor}
              subtitle={metric.subtitle}
              title={metric.title}
              value={metric.value}
            />
          ))}
        </View>

        <SurfaceCard>
          <View style={{ gap: 10 }}>
            <Text style={styles.sectionTitle}>Sensores y diagnóstico</Text>
            <View style={{ gap: 8 }}>
              <ListRow
                icon={<Zap color={PENCIL.success} size={18} strokeWidth={2.1} />}
                subtitle={`${profile?.realtime?.deviceLabel ?? 'OBD2 Bluetooth'} · ${anomalyLabel}`}
                title="Motor"
                value={telemetry.anomaly?.severity === 'WARNING' || telemetry.anomaly?.severity === 'CRITICAL' ? 'Revisar' : 'OK'}
                valueColor={telemetry.anomaly?.severity === 'WARNING' || telemetry.anomaly?.severity === 'CRITICAL' ? PENCIL.warning : PENCIL.success}
              />
              <ListRow
                icon={<Thermometer color={PENCIL.warning} size={18} strokeWidth={2.1} />}
                subtitle={hasEngineTemp ? `Motor ${engineTempValue}${temperatureUnit}` : 'Temperatura no disponible'}
                title="Refrigeración"
                value={hasEngineTemp && telemetry.engineTemp > 100 ? 'Revisar' : 'OK'}
                valueColor={hasEngineTemp && telemetry.engineTemp > 100 ? PENCIL.warning : PENCIL.success}
              />
              <ListRow
                icon={<Activity color={PENCIL.accent} size={18} strokeWidth={2.1} />}
                subtitle={`Carga ${telemetry.engineLoad}% y acelerador ${telemetry.throttle}%`}
                title="ECU"
                value="OK"
                valueColor={PENCIL.success}
              />
            </View>
          </View>
        </SurfaceCard>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: 14,
  },
  heroCard: {
    gap: 12,
  },
  heroTop: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-end',
  },
  metricLabel: {
    color: PENCIL.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  speedValue: {
    color: PENCIL.text,
    fontSize: 42,
    lineHeight: 44,
    fontWeight: '800',
  },
  metricSubtitle: {
    color: PENCIL.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  rpmCard: {
    width: 120,
    alignItems: 'flex-start',
    gap: 2,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PENCIL.border,
    backgroundColor: PENCIL.surfaceAlt,
  },
  rpmValue: {
    color: PENCIL.text,
    fontSize: 28,
    lineHeight: 31,
    fontWeight: '800',
  },
  heroStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 2,
  },
  heroStatusText: {
    color: PENCIL.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  sectionTitle: {
    color: PENCIL.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
});
