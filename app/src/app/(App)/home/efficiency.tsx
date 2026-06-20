import {
  Card,
} from 'heroui-native';
import {
  Gauge,
  CircleGauge,
  Leaf,
  Route,
  Sparkles,
  TimerReset,
  Zap,
} from 'lucide-react-native';
import { View, Text, StyleSheet } from 'react-native';

import { useSession } from '@/components/providers/session-provider';
import {
  AppScreen,
  CompactMetricCard,
  DetailHeader,
  IconBubble,
  PENCIL,
  ProgressBars,
  SurfaceCard,
} from '@/components/pencil-ui';
import { backOrFallback } from '@/lib/navigation';

const behaviorInsights = [
  {
    title: 'Aceleración',
    subtitle: 'Mantén el pedal estable en arranques cortos',
    icon: <Sparkles color={PENCIL.accent} size={18} strokeWidth={2.1} />,
    iconBackground: PENCIL.accentSoft,
  },
  {
    title: 'Frenado',
    subtitle: 'Evita frenadas bruscas en tráfico lento',
    icon: <Zap color={PENCIL.warning} size={18} strokeWidth={2.1} />,
    iconBackground: PENCIL.warningSoft,
  },
  {
    title: 'Trayectoria',
    subtitle: 'Tu ruta diaria se está volviendo más eficiente',
    icon: <Route color={PENCIL.success} size={18} strokeWidth={2.1} />,
    iconBackground: PENCIL.successSoft,
  },
] as const;

export default function EfficiencyScreen() {
  const { profile } = useSession();
  const efficiency = profile?.efficiency;
  const score = efficiency?.score ?? 82;
  const accelerationPercent = efficiency?.accelerationPercent ?? 87;
  const brakingPercent = efficiency?.brakingPercent ?? 91;
  const idleMinutes = efficiency?.idleMinutes ?? 14;
  const economyValue = efficiency?.economyValue ?? 8.6;

  return (
    <AppScreen
      contentTopPadding={8}
      header={(
        <DetailHeader
          onBack={() => backOrFallback('/home')}
          title="Eficiencia"
        />
      )}
    >
      <View style={styles.page}>
        <SurfaceCard>
          <View style={styles.scoreCard}>
            <View style={styles.scoreHeader}>
              <View style={styles.scoreCopy}>
                <View style={styles.scoreValueRow}>
                  <Text style={styles.scoreValue}>{score}</Text>
                  <Text style={styles.scoreScale}>de 100</Text>
                </View>
                <Text style={styles.scoreDescription}>Puntaje general de eficiencia</Text>
              </View>
              <View style={styles.scoreIcon}>
                <Sparkles color={PENCIL.warning} size={18} strokeWidth={2.2} />
              </View>
            </View>

            <ProgressBars values={[1, 1, 1, score >= 80 ? 1 : 0, score >= 90 ? 1 : 0]} activeColor={PENCIL.accent} inactiveColor="#DCEAE7" />
          </View>
        </SurfaceCard>

        <View style={styles.metricGrid}>
          <CompactMetricCard
            icon={<Route color={PENCIL.accent} size={16} strokeWidth={2.2} />}
            iconBackground={PENCIL.accentSoft}
            iconColor={PENCIL.accent}
            subtitle="Suavidad"
            title="Aceleración"
            value={`${accelerationPercent}%`}
          />
          <CompactMetricCard
            icon={<Gauge color={PENCIL.success} size={16} strokeWidth={2.2} />}
            iconBackground={PENCIL.successSoft}
            iconColor={PENCIL.success}
            subtitle="Control"
            title="Frenado"
            value={`${brakingPercent}%`}
          />
          <CompactMetricCard
            icon={<TimerReset color={PENCIL.warning} size={16} strokeWidth={2.2} />}
            iconBackground={PENCIL.warningSoft}
            iconColor={PENCIL.warning}
            subtitle="Tiempo"
            title="Ralenti"
            value={`${idleMinutes}m`}
          />
          <CompactMetricCard
            icon={<Leaf color={PENCIL.success} size={16} strokeWidth={2.2} />}
            iconBackground={PENCIL.successSoft}
            iconColor={PENCIL.success}
            subtitle="Consumo"
            title="Eficiencia"
            value={economyValue.toFixed(1)}
          />
        </View>

        <View style={styles.behaviorSection}>
          <Text style={styles.sectionTitle}>Análisis de comportamiento</Text>

          <View style={styles.behaviorStack}>
            {behaviorInsights.map((item) => (
              <Card key={item.title} className="p-0" style={styles.behaviorCardSurface}>
                <Card.Body className="p-0">
                  <View style={styles.behaviorCard}>
                    <IconBubble
                      backgroundColor={item.iconBackground}
                      borderColor={item.iconBackground}
                      size={40}
                    >
                      {item.icon}
                    </IconBubble>

                    <View style={styles.behaviorCopy}>
                      <Text style={styles.behaviorTitle}>{item.title}</Text>
                      <Text style={styles.behaviorSubtitle}>{item.subtitle}</Text>
                    </View>

                    <CircleGauge color="#D0D5DD" size={18} strokeWidth={2.1} />
                  </View>
                </Card.Body>
              </Card>
            ))}
          </View>
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: 14,
  },
  scoreCard: {
    gap: 12,
  },
  scoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  scoreCopy: {
    flex: 1,
    gap: 2,
  },
  scoreValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  scoreValue: {
    color: PENCIL.text,
    fontSize: 40,
    lineHeight: 42,
    fontWeight: '800',
  },
  scoreScale: {
    color: PENCIL.muted,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  scoreDescription: {
    color: PENCIL.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  scoreIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PENCIL.border,
    backgroundColor: PENCIL.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
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
  behaviorSection: {
    gap: 10,
  },
  behaviorStack: {
    gap: 10,
  },
  behaviorCardSurface: {
    backgroundColor: '#FFFFFF',
    borderCurve: 'continuous',
    borderRadius: 22,
    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.10), 0 2px 8px rgba(15, 23, 42, 0.05)',
  },
  behaviorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  behaviorCopy: {
    flex: 1,
    gap: 2,
  },
  behaviorTitle: {
    color: PENCIL.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  behaviorSubtitle: {
    color: PENCIL.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
});
