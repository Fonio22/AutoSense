import { router, type Href } from 'expo-router';
import {
  Fuel,
  Gauge,
  Leaf,
  Route,
  TimerReset,
} from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/components/providers/session-provider';
import {
  AppScreen,
  IconBubble,
  PENCIL,
  ScreenTitle,
  SurfaceCard,
} from '@/components/pencil-ui';
import { type AutoSenseTripDoc, useUserTrips } from '@/lib/autosense-data';

function getTripColors(category: AutoSenseTripDoc['category']) {
  switch (category) {
    case 'city':
      return {
        iconBackground: '#F1ECFF',
        iconColor: '#6D5EF9',
        statusBackground: PENCIL.successSoft,
        statusColor: PENCIL.success,
      };
    case 'north':
      return {
        iconBackground: '#EAF6FF',
        iconColor: '#0EA5E9',
        statusBackground: '#EEF2FF',
        statusColor: PENCIL.accent,
      };
    case 'home':
      return {
        iconBackground: PENCIL.successSoft,
        iconColor: PENCIL.success,
        statusBackground: PENCIL.successSoft,
        statusColor: PENCIL.success,
      };
    default:
      return {
        iconBackground: '#EEF2FF',
        iconColor: PENCIL.accent,
        statusBackground: PENCIL.successSoft,
        statusColor: PENCIL.success,
      };
  }
}

function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours) {
    return `${minutes}m`;
  }

  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

function buildTripStats(trips: AutoSenseTripDoc[]) {
  const totalDistance = trips.reduce(
    (sum, trip) => sum + Number.parseFloat(trip.distanceLabel),
    0,
  );
  const totalFuel = trips.reduce((sum, trip) => sum + trip.fuelLiters, 0);
  const totalMinutes = trips.reduce((sum, trip) => sum + trip.durationMinutes, 0);
  const averageScore = trips.length
    ? Math.round(trips.reduce((sum, trip) => sum + trip.score, 0) / trips.length)
    : 0;

  return [
    {
      title: 'Total',
      value: totalDistance.toFixed(1),
      subtitle: 'Kilometros',
      icon: <Route color={PENCIL.accent} size={16} strokeWidth={2.1} />,
      iconBackground: PENCIL.accentSoft,
      iconColor: PENCIL.accent,
    },
    {
      title: 'Tiempo',
      value: formatMinutes(totalMinutes),
      subtitle: 'Conduccion',
      icon: <TimerReset color={PENCIL.success} size={16} strokeWidth={2.1} />,
      iconBackground: PENCIL.successSoft,
      iconColor: PENCIL.success,
    },
    {
      title: 'Score',
      value: String(averageScore || 0),
      subtitle: 'Promedio',
      icon: <Gauge color={PENCIL.warning} size={16} strokeWidth={2.1} />,
      iconBackground: PENCIL.warningSoft,
      iconColor: PENCIL.warning,
    },
    {
      title: 'Combustible',
      value: `${totalFuel.toFixed(1)}L`,
      subtitle: 'Estimado',
      icon: <Fuel color={PENCIL.accent} size={16} strokeWidth={2.1} />,
      iconBackground: PENCIL.accentSoft,
      iconColor: PENCIL.accent,
    },
  ] as const;
}

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

function TripCard({ trip }: { trip: AutoSenseTripDoc }) {
  const colors = getTripColors(trip.category);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/home/trips/${trip.id}` as Href)}
      style={({ pressed }) => [styles.tripPressable, pressed ? styles.tripPressed : null]}
    >
      <SurfaceCard padding={12}>
        <View style={styles.tripCard}>
          <View style={styles.tripTopRow}>
            <View style={styles.tripLeading}>
              <IconBubble
                backgroundColor={colors.iconBackground}
                borderColor={PENCIL.border}
                size={40}
              >
                <Route color={colors.iconColor} size={18} strokeWidth={2.2} />
              </IconBubble>

              <View style={styles.tripCopy}>
                <Text style={styles.tripTitle}>
                  {trip.period} · {trip.route}
                </Text>
                <Text style={styles.tripSummary}>{trip.summary}</Text>
              </View>
            </View>

            <View style={[styles.tripScorePill, { borderColor: '#86EFAC' }]}>
              <Text style={[styles.tripScoreValue, { color: '#16A34A' }]}>
                {trip.score}
              </Text>
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
              icon={<Leaf color={colors.statusColor} size={14} strokeWidth={2.1} />}
              label={trip.statusLabel}
              backgroundColor={colors.statusBackground}
              textColor={colors.statusColor}
            />
          </View>
        </View>
      </SurfaceCard>
    </Pressable>
  );
}

export default function TripsScreen() {
  const { firebaseUser } = useSession();
  const { trips } = useUserTrips(firebaseUser?.uid);
  const tripStats = buildTripStats(trips);

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
