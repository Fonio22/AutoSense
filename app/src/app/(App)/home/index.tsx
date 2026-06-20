import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useState } from 'react';
import {
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from 'heroui-native';
import {
  CarFront,
  CircleAlert,
  Gauge,
  Route,
  Sparkles,
} from 'lucide-react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { useSession } from '@/components/providers/session-provider';
import { PENCIL } from '@/components/pencil-ui';
import {
  getAlertCount,
  getPriorityAlert,
  useUserTrips,
} from '@/lib/autosense-data';

const heroCarSource = require('../../../../assets/images/home-car-hero.png');
const HERO_HEIGHT = 430;
const HERO_ART_TOP = 104;
const HERO_ART_HEIGHT = 324;
const HERO_CONTENT_TOP = 378;
const HERO_EDGE_FILL_TOP = '#B4B4BA';
const HERO_EDGE_FILL_MID = '#B9B9BF';
const HERO_EDGE_FILL_BOTTOM = '#BBBBC0';
const ABSOLUTE_FILL = {
  bottom: 0,
  left: 0,
  position: 'absolute' as const,
  right: 0,
  top: 0,
};

function HeroBackfill() {
  return (
    <Svg pointerEvents="none" preserveAspectRatio="none" style={styles.heroBackfill} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="heroBackfill" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor={HERO_EDGE_FILL_TOP} />
          <Stop offset="0.52" stopColor={HERO_EDGE_FILL_MID} />
          <Stop offset="1" stopColor={HERO_EDGE_FILL_BOTTOM} />
        </LinearGradient>
      </Defs>
      <Rect fill="url(#heroBackfill)" height="100" width="100" x="0" y="0" />
    </Svg>
  );
}

function HeroGradient() {
  return (
    <Svg pointerEvents="none" preserveAspectRatio="none" style={styles.heroGradient} viewBox="0 0 100 220">
      <Defs>
        <LinearGradient id="heroFade" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#000000" stopOpacity="0.62" />
          <Stop offset="0.42" stopColor="#000000" stopOpacity="0.28" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect fill="url(#heroFade)" height="220" width="100" x="0" y="0" />
    </Svg>
  );
}

function HeroEdgeBlend() {
  return (
    <Svg pointerEvents="none" preserveAspectRatio="none" style={styles.heroEdgeBlend} viewBox="0 0 100 56">
      <Defs>
        <LinearGradient id="heroEdgeBlend" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor={HERO_EDGE_FILL_BOTTOM} stopOpacity="1" />
          <Stop offset="1" stopColor={HERO_EDGE_FILL_BOTTOM} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect fill="url(#heroEdgeBlend)" height="56" width="100" x="0" y="0" />
    </Svg>
  );
}

function HeroBottomFade() {
  return (
    <Svg
      pointerEvents="none"
      preserveAspectRatio="none"
      style={styles.heroBottomFade}
      viewBox="0 0 100 120"
    >
      <Defs>
        <LinearGradient id="heroBottomFade" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="0.42" stopColor="#FFFFFF" stopOpacity="0.18" />
          <Stop offset="0.78" stopColor="#FFFFFF" stopOpacity="0.72" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Rect fill="url(#heroBottomFade)" height="120" width="100" x="0" y="0" />
    </Svg>
  );
}

function HomeBadge({
  children,
  backgroundColor,
  borderColor,
  size = 48,
  radius = 16,
}: {
  children: ReactNode;
  backgroundColor: string;
  borderColor?: string;
  size?: number;
  radius?: number;
}) {
  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor,
          borderColor: borderColor ?? backgroundColor,
        },
      ]}
    >
      {children}
    </View>
  );
}

function GasPumpIcon({ color, size = 30 }: { color: string; size?: number }) {
  return (
    <Svg height={size} viewBox="0 0 24 24" width={size} fill="none">
      <Path
        d="M7 3.5h5.8a2 2 0 0 1 2 2v12.6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.9}
      />
      <Path
        d="M7.3 8.2h5.3"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.9}
      />
      <Rect
        height="4.6"
        rx="0.9"
        stroke={color}
        strokeLinejoin="round"
        strokeWidth={1.7}
        width="3.8"
        x="8.6"
        y="12.2"
      />
      <Path
        d="M15 7.3h1.2c1.2 0 2.2 1 2.2 2.2v5.3a2.3 2.3 0 0 0 2.3 2.3"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.9}
      />
      <Path
        d="M18.7 17.2v-1.9"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.9}
      />
    </Svg>
  );
}

function HomeMetricCard({
  title,
  value,
  subtitle,
  icon,
  iconBackground,
  iconColor,
  onPress,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  iconBackground: string;
  iconColor: string;
  onPress?: () => void;
}) {
  const content = (
    <Card className="p-0" style={styles.cardSurface}>
      <Card.Body className="p-0">
        <View style={styles.metricCard}>
          <View style={styles.metricCardTopRow}>
            <HomeBadge backgroundColor={iconBackground} borderColor={PENCIL.border} size={36}>
              {icon}
            </HomeBadge>
            <Text style={[styles.metricValue, { color: iconColor }]}>{value}</Text>
          </View>

          <View style={styles.metricBottom}>
            <Text style={styles.metricTitle}>{title}</Text>
            <Text style={styles.metricSubtitle}>{subtitle}</Text>
          </View>
        </View>
      </Card.Body>
    </Card>
  );

  if (!onPress) {
    return <View style={styles.metricCardWrap}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.metricCardWrap, pressed ? styles.metricCardPressed : null]}
    >
      {content}
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { firebaseUser, profile } = useSession();
  const { trips } = useUserTrips(firebaseUser?.uid);
  const [heroBlurProgress, setHeroBlurProgress] = useState(0);
  const latestTrip = trips[0] ?? null;
  const dashboard = profile?.dashboard;
  const alertCount = profile ? getAlertCount(profile.alerts) : 1;
  const priorityAlert = profile ? getPriorityAlert(profile.alerts) : null;
  const heroTitle = profile?.vehicle?.name ?? 'Honda Civic 1.5T';
  const fuelPercent = dashboard?.fuelPercent ?? 48;
  const remainingRangeKm = dashboard?.remainingRangeKm ?? 318;
  const drivingStyle = dashboard?.drivingStyle ?? 'Suave';
  const drivingStyleNote = dashboard?.drivingStyleNote ?? 'Aceleraciones estables';
  const efficiencyScore = dashboard?.efficiencyScore ?? 82;
  const efficiencyNote = dashboard?.efficiencyNote ?? 'Buen ahorro esta semana';
  const currentTripDistance = dashboard?.currentTripDistanceKm ?? 28.4;
  const currentTripConsumption =
    dashboard?.currentTripConsumptionLabel ?? 'Promedio 8.1 L/100 km';
  const savingsTip =
    dashboard?.savingsTip
    ?? 'Mantén velocidades constantes; podrías ahorrar 9% de gasolina en rutas urbanas.';

  function handleHomeScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const offsetY = Math.max(0, event.nativeEvent.contentOffset.y);
    const nextProgress = Math.min(1, offsetY / 72);

    setHeroBlurProgress((currentProgress) => {
      if (Math.abs(currentProgress - nextProgress) < 0.025) {
        return currentProgress;
      }

      return nextProgress;
    });
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <View style={[styles.heroCard, { height: HERO_HEIGHT }]}>
        <HeroBackfill />
        <Image
          resizeMode="contain"
          source={heroCarSource}
          style={[styles.heroArt, { opacity: 1 - heroBlurProgress * 0.72 }]}
        />
        <HeroEdgeBlend />
        <View
          pointerEvents="none"
          style={[styles.heroBlurLayer, { opacity: heroBlurProgress }]}
        >
          <Image
            blurRadius={18}
            resizeMode="contain"
            source={heroCarSource}
            style={styles.heroArt}
          />
        </View>
        <View
          pointerEvents="none"
          style={[styles.heroFrostLayer, { opacity: heroBlurProgress * 0.14 }]}
        />
        <HeroBottomFade />
        <HeroGradient />
        <Text style={[styles.heroTitle, { top: insets.top + 6 }]}>{heroTitle}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: insets.bottom + 108,
            paddingTop: HERO_CONTENT_TOP,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        onScroll={handleHomeScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={StyleSheet.absoluteFill}
      >
        <View style={styles.contentFrame}>
          <Card className="p-0" style={styles.cardSurface}>
            <Card.Body className="p-0">
              <View style={styles.fuelCard}>
                <View style={styles.fuelTopRow}>
                  <Text style={styles.fuelLabel}>Gasolina restante</Text>
                </View>

                <View style={styles.fuelCopy}>
                  <View style={styles.fuelPercentRow}>
                    <Text style={styles.fuelPercent}>{fuelPercent}%</Text>
                    <HomeBadge
                      backgroundColor="#F3F4F6"
                      borderColor="#E5E7EB"
                      radius={15}
                      size={52}
                    >
                      <GasPumpIcon color={PENCIL.accent} size={22} />
                    </HomeBadge>
                  </View>
                  <Text style={styles.fuelMeta}>
                    Aprox. {remainingRangeKm} km antes de repostar
                  </Text>
                </View>

                <View style={styles.fuelTrack}>
                  <View style={[styles.fuelFill, { width: `${fuelPercent}%` }]} />
                </View>
              </View>
            </Card.Body>
          </Card>

          <View style={styles.metricGrid}>
            <HomeMetricCard
              icon={<CarFront color={PENCIL.success} size={16} strokeWidth={2.2} />}
              iconBackground={PENCIL.successSoft}
              iconColor={PENCIL.success}
              onPress={() => router.push('/home/efficiency')}
              subtitle={drivingStyleNote}
              title="Mi forma de manejo"
              value={drivingStyle}
            />

            <HomeMetricCard
              icon={<Gauge color="#6D5EF9" size={16} strokeWidth={2.2} />}
              iconBackground="#F1ECFF"
              iconColor="#6D5EF9"
              onPress={() => router.push('/home/efficiency')}
              subtitle={efficiencyNote}
              title="Eficiencia"
              value={`${efficiencyScore}%`}
            />

            <HomeMetricCard
              icon={<Route color={PENCIL.accent} size={16} strokeWidth={2.2} />}
              iconBackground="#EEF2FF"
              iconColor={PENCIL.accent}
              onPress={() =>
                router.push({
                  pathname: '/trips/[tripId]',
                  params: {
                    origin: 'home',
                    tripId: latestTrip?.id ?? 'today',
                  },
                })
              }
              subtitle={currentTripConsumption}
              title="Viaje actual"
              value={`${Math.round(currentTripDistance)} km`}
            />

            <HomeMetricCard
              icon={<CircleAlert color={PENCIL.warning} size={16} strokeWidth={2.2} />}
              iconBackground={PENCIL.warningSoft}
              iconColor={PENCIL.warning}
              onPress={() => router.push('/home/alerts')}
              subtitle={priorityAlert?.subtitle ?? 'Sin alertas prioritarias'}
              title="Prioridad"
              value={`${alertCount} ${alertCount === 1 ? 'aviso' : 'avisos'}`}
            />
          </View>

          <Card className="p-0" style={styles.cardSurface}>
            <Card.Body className="p-0">
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/home/efficiency')}
                style={({ pressed }) => [styles.insightRow, pressed ? styles.metricCardPressed : null]}
              >
                <HomeBadge
                  backgroundColor={PENCIL.accentSoft}
                  borderColor={PENCIL.accentBorder}
                  size={36}
                  radius={12}
                >
                  <Sparkles color={PENCIL.accent} size={15} strokeWidth={2.2} />
                </HomeBadge>

                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.insightTitle}>Sugerencia de ahorro</Text>
                  <Text style={styles.insightText}>{savingsTip}</Text>
                </View>
              </Pressable>
            </Card.Body>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  heroCard: {
    backgroundColor: HERO_EDGE_FILL_BOTTOM,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  heroBackfill: {
    ...ABSOLUTE_FILL,
    zIndex: 0,
  },
  heroArt: {
    alignSelf: 'center',
    height: HERO_ART_HEIGHT,
    left: 0,
    position: 'absolute',
    right: 0,
    top: HERO_ART_TOP,
    width: '100%',
    zIndex: 1,
  },
  heroEdgeBlend: {
    height: 56,
    left: 0,
    position: 'absolute',
    right: 0,
    top: HERO_ART_TOP - 1,
    zIndex: 2,
  },
  heroBlurLayer: {
    ...ABSOLUTE_FILL,
    zIndex: 3,
  },
  heroFrostLayer: {
    ...ABSOLUTE_FILL,
    backgroundColor: '#020617',
    zIndex: 4,
  },
  heroBottomFade: {
    bottom: 0,
    height: 120,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 5,
  },
  heroGradient: {
    height: 220,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 6,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 0,
    left: 0,
    lineHeight: 36,
    paddingHorizontal: 22,
    position: 'absolute',
    right: 0,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.38)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
    zIndex: 7,
  },
  scrollContent: {
    flexGrow: 1,
  },
  contentFrame: {
    gap: 10,
    paddingHorizontal: 14,
  },
  cardSurface: {
    backgroundColor: '#FFFFFF',
    borderCurve: 'continuous',
    borderRadius: 24,
    boxShadow: '0 12px 28px rgba(15, 23, 42, 0.10), 0 2px 8px rgba(15, 23, 42, 0.06)',
  },
  fuelCard: {
    gap: 12,
    padding: 16,
  },
  fuelTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  fuelLabel: {
    color: '#2563EB',
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 22,
  },
  fuelPercentRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  fuelCopy: {
    flex: 1,
    gap: 4,
  },
  fuelPercent: {
    color: PENCIL.text,
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 46,
  },
  fuelMeta: {
    color: PENCIL.muted,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
    marginTop: 4,
  },
  fuelTrack: {
    height: 11,
    borderRadius: 9999,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  fuelFill: {
    height: '100%',
    borderRadius: 9999,
    backgroundColor: '#2563EB',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCardWrap: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 0,
  },
  metricCardPressed: {
    opacity: 0.9,
  },
  metricCard: {
    gap: 6,
    minHeight: 132,
    padding: 13,
  },
  metricCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  metricValue: {
    flexShrink: 1,
    textAlign: 'right',
    color: PENCIL.text,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 24,
    marginBottom: 1,
  },
  metricBottom: {
    marginTop: 'auto',
    gap: 3,
  },
  metricTitle: {
    color: PENCIL.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  metricSubtitle: {
    color: PENCIL.muted,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 15,
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
  },
  insightTitle: {
    color: PENCIL.text,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 20,
  },
  insightText: {
    color: PENCIL.muted,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
});
