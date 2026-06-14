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
import { backOrFallback } from '@/lib/navigation';

const METRICS = [
  {
    title: 'Temp motor',
    value: '91°C',
    subtitle: 'Estable',
    icon: <Thermometer color={PENCIL.warning} size={16} strokeWidth={2.2} />,
    iconBackground: PENCIL.warningSoft,
    iconColor: PENCIL.warning,
  },
  {
    title: 'Combustible',
    value: '58 L',
    subtitle: 'Estimado',
    icon: <Fuel color={PENCIL.success} size={16} strokeWidth={2.2} />,
    iconBackground: PENCIL.successSoft,
    iconColor: PENCIL.success,
  },
  {
    title: 'Carga motor',
    value: '36%',
    subtitle: 'Normal',
    icon: <Activity color={PENCIL.accent} size={16} strokeWidth={2.2} />,
    iconBackground: PENCIL.accentSoft,
    iconColor: PENCIL.accent,
  },
  {
    title: 'Voltaje ECU',
    value: '13.8V',
    subtitle: 'Correcto',
    icon: <BatteryCharging color={PENCIL.success} size={16} strokeWidth={2.2} />,
    iconBackground: PENCIL.successSoft,
    iconColor: PENCIL.success,
  },
  {
    title: 'Acelerador',
    value: '18%',
    subtitle: 'Suave',
    icon: <Gauge color={PENCIL.warning} size={16} strokeWidth={2.2} />,
    iconBackground: PENCIL.warningSoft,
    iconColor: PENCIL.warning,
  },
  {
    title: 'Aire admisión',
    value: '24°C',
    subtitle: 'Estable',
    icon: <Wind color={PENCIL.accent} size={16} strokeWidth={2.2} />,
    iconBackground: PENCIL.accentSoft,
    iconColor: PENCIL.accent,
  },
] as const;

export default function RealtimeLiveScreen() {
  return (
    <AppScreen
      contentTopPadding={8}
      header={(
        <DetailHeader
          onBack={() => backOrFallback('/realtime')}
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
                <Text style={styles.speedValue}>88</Text>
                <Text style={styles.metricSubtitle}>km/h</Text>
              </View>

              <View style={styles.rpmCard}>
                <Text style={styles.metricLabel}>RPM</Text>
                <Text style={styles.rpmValue}>2350</Text>
                <Text style={styles.metricSubtitle}>Revoluciones</Text>
              </View>
            </View>

            <View style={styles.heroStatus}>
              <CircleCheck color={PENCIL.success} size={16} strokeWidth={2.2} />
              <Text style={styles.heroStatusText}>Sensores conectados y transmitiendo</Text>
            </View>
          </View>
        </SurfaceCard>

        <View style={styles.metricGrid}>
          {METRICS.map((metric) => (
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
                subtitle="Lectura estable · sin errores"
                title="Motor"
                value="OK"
                valueColor={PENCIL.success}
              />
              <ListRow
                icon={<Thermometer color={PENCIL.warning} size={18} strokeWidth={2.1} />}
                subtitle="Temperatura dentro de rango"
                title="Refrigeración"
                value="OK"
                valueColor={PENCIL.success}
              />
              <ListRow
                icon={<Activity color={PENCIL.accent} size={18} strokeWidth={2.1} />}
                subtitle="Sin cambios bruscos"
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
