import { router } from 'expo-router';
import {
  Fuel,
  Gauge,
  Leaf,
  Route,
  TimerReset,
} from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppScreen,
  IconBubble,
  PENCIL,
  ScreenTitle,
  SurfaceCard,
} from '@/components/pencil-ui';

const tripStats = [
  {
    title: 'Total',
    value: '109.3',
    subtitle: 'Kilómetros',
    icon: <Route color={PENCIL.accent} size={16} strokeWidth={2.1} />,
    iconBackground: PENCIL.accentSoft,
    iconColor: PENCIL.accent,
  },
  {
    title: 'Tiempo',
    value: '2h 07m',
    subtitle: 'Conducción',
    icon: <TimerReset color={PENCIL.success} size={16} strokeWidth={2.1} />,
    iconBackground: PENCIL.successSoft,
    iconColor: PENCIL.success,
  },
  {
    title: 'Score',
    value: '90',
    subtitle: 'Promedio',
    icon: <Gauge color={PENCIL.warning} size={16} strokeWidth={2.1} />,
    iconBackground: PENCIL.warningSoft,
    iconColor: PENCIL.warning,
  },
  {
    title: 'Combustible',
    value: '17.2L',
    subtitle: 'Estimado',
    icon: <Fuel color={PENCIL.accent} size={16} strokeWidth={2.1} />,
    iconBackground: PENCIL.accentSoft,
    iconColor: PENCIL.accent,
  },
] as const;

const trips = [
  {
    id: 'today',
    period: 'Hoy',
    route: 'Universidad',
    summary: '32 min · 18.4 km · 1.6 L',
    score: '91',
    iconBackground: '#EEF2FF',
    iconColor: PENCIL.accent,
    timeLabel: '32 min',
    fuelLabel: '1.6 L',
    statusLabel: 'Alta',
    statusBackground: PENCIL.successSoft,
    statusColor: PENCIL.success,
  },
  {
    id: 'yesterday',
    period: 'Ayer',
    route: 'Centro',
    summary: '48 min · 24.1 km · 2.4 L',
    score: '88',
    iconBackground: '#F1ECFF',
    iconColor: '#6D5EF9',
    timeLabel: '48 min',
    fuelLabel: '2.4 L',
    statusLabel: 'Media',
    statusBackground: PENCIL.successSoft,
    statusColor: PENCIL.success,
  },
  {
    id: 'north',
    period: '28 may',
    route: 'Ruta norte',
    summary: '1h 12 min · 54.8 km · 4.9 L',
    score: '95',
    iconBackground: '#EAF6FF',
    iconColor: '#0EA5E9',
    timeLabel: '1h 12m',
    fuelLabel: '4.9 L',
    statusLabel: 'Norte',
    statusBackground: '#EEF2FF',
    statusColor: PENCIL.accent,
  },
  {
    id: 'home',
    period: '26 may',
    route: 'Casa',
    summary: '21 min · 11.2 km · 0.9 L',
    score: '94',
    iconBackground: PENCIL.successSoft,
    iconColor: PENCIL.success,
    timeLabel: '21 min',
    fuelLabel: '0.9 L',
    statusLabel: 'Óptima',
    statusBackground: PENCIL.successSoft,
    statusColor: PENCIL.success,
  },
] as const;

function TripStatCard({
  title,
  value,
  subtitle,
  icon,
  iconBackground,
  iconColor,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  iconBackground: string;
  iconColor: string;
}) {
  return (
    <SurfaceCard padding={12}>
      <View style={styles.statCard}>
        <View style={styles.statCardTop}>
          <Text style={styles.statCardTitle}>{title}</Text>
          <IconBubble backgroundColor={iconBackground} borderColor={PENCIL.border} size={30}>
            {icon}
          </IconBubble>
        </View>

        <Text style={[styles.statCardValue, { color: iconColor }]}>{value}</Text>
        <Text style={styles.statCardSubtitle}>{subtitle}</Text>
      </View>
    </SurfaceCard>
  );
}

function TripTag({
  icon,
  label,
  backgroundColor,
  textColor,
}: {
  icon: React.ReactNode;
  label: string;
  backgroundColor: string;
  textColor: string;
}) {
  return (
    <View style={[styles.tripTag, { backgroundColor }]}>
      {icon}
      <Text style={[styles.tripTagLabel, { color: textColor }]}>{label}</Text>
    </View>
  );
}

function TripCard({
  trip,
}: {
  trip: (typeof trips)[number];
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/trips/${trip.id}`)}
      style={({ pressed }) => [styles.tripPressable, pressed ? styles.tripPressed : null]}
    >
      <SurfaceCard padding={12}>
        <View style={styles.tripCard}>
          <View style={styles.tripTopRow}>
            <View style={styles.tripLeading}>
              <IconBubble backgroundColor={trip.iconBackground} borderColor={PENCIL.border} size={40}>
                <Route color={trip.iconColor} size={18} strokeWidth={2.2} />
              </IconBubble>

              <View style={styles.tripCopy}>
                <Text style={styles.tripTitle}>
                  {trip.period} · {trip.route}
                </Text>
                <Text style={styles.tripSummary}>{trip.summary}</Text>
              </View>
            </View>

            <View style={[styles.tripScorePill, { borderColor: '#86EFAC' }]}>
              <Text style={[styles.tripScoreValue, { color: '#16A34A' }]}>{trip.score}</Text>
              <Text style={[styles.tripScoreLabel, { color: '#16A34A' }]}>score</Text>
            </View>
          </View>

          <View style={styles.tripTagsRow}>
            <TripTag
              icon={<TimerReset color="#667085" size={14} strokeWidth={2.1} />}
              label={trip.timeLabel}
              backgroundColor="#F8FAFC"
              textColor="#667085"
            />
            <TripTag
              icon={<Fuel color={PENCIL.warning} size={14} strokeWidth={2.1} />}
              label={trip.fuelLabel}
              backgroundColor={PENCIL.warningSoft}
              textColor={PENCIL.warning}
            />
            <TripTag
              icon={<Leaf color={trip.statusColor} size={14} strokeWidth={2.1} />}
              label={trip.statusLabel}
              backgroundColor={trip.statusBackground}
              textColor={trip.statusColor}
            />
          </View>
        </View>
      </SurfaceCard>
    </Pressable>
  );
}

export default function TripsScreen() {
  return (
    <AppScreen contentTopPadding={14}>
      <View style={styles.page}>
        <ScreenTitle
          right={<Text style={styles.periodText}>Este mes</Text>}
          subtitle="Rendimiento, consumo y score por recorrido"
          title="Historial de viajes"
        />

        <View style={styles.metricGrid}>
          {tripStats.map((stat) => (
            <View key={stat.title} style={styles.metricCell}>
              <TripStatCard
                icon={stat.icon}
                iconBackground={stat.iconBackground}
                iconColor={stat.iconColor}
                subtitle={stat.subtitle}
                title={stat.title}
                value={stat.value}
              />
            </View>
          ))}
        </View>

        <View style={styles.tripList}>
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: 14,
  },
  periodText: {
    color: PENCIL.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
    marginTop: 4,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCell: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 0,
  },
  statCard: {
    gap: 6,
  },
  statCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  statCardTitle: {
    flex: 1,
    color: PENCIL.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  statCardValue: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
  },
  statCardSubtitle: {
    color: PENCIL.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
  tripList: {
    gap: 12,
  },
  tripPressable: {
    borderRadius: 24,
  },
  tripPressed: {
    opacity: 0.92,
  },
  tripCard: {
    gap: 8,
  },
  tripTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  tripLeading: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tripCopy: {
    flex: 1,
    gap: 1,
  },
  tripTitle: {
    color: PENCIL.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
  },
  tripSummary: {
    color: PENCIL.muted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '500',
  },
  tripScorePill: {
    minWidth: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 7,
    paddingVertical: 5,
    backgroundColor: '#F8FFF8',
  },
  tripScoreValue: {
    fontSize: 15,
    lineHeight: 17,
    fontWeight: '800',
  },
  tripScoreLabel: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
    marginTop: -1,
  },
  tripTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  tripTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 9999,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  tripTagLabel: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
  },
});
