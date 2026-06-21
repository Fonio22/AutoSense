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
  Bluetooth,
  CarFront,
  CircleAlert,
  Gauge,
  Radio,
  Route,
  Sparkles,
} from 'lucide-react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { useSession } from '@/components/providers/session-provider';
import { PENCIL } from '@/components/pencil-ui';
import {
  getAlertCount,
  getPriorityAlert,
  isLegacySeededDashboard,
  isLegacySeededVehicle,
  useHasRegisteredDevice,
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

function ConnectObdHome({ onOpenRealtime }: { onOpenRealtime: () => void }) {
  return (
    <View style={styles.connectPage}>
      <View style={styles.connectHero}>
        <Image
          resizeMode="cover"
          source={heroCarSource}
          style={styles.connectHeroImage}
        />
        <View style={styles.connectImageWash} />

        <View style={styles.connectStatusPill}>
          <Radio color={PENCIL.accent} size={16} strokeWidth={2.3} />
          <Text style={styles.connectKicker}>Primer AutoSense</Text>
        </View>

        <View style={styles.connectContent}>
          <View style={styles.connectIcon}>
            <Radio color={PENCIL.accent} size={30} strokeWidth={2.2} />
          </View>
          <Text style={styles.connectTitle}>Registra tu primer OBD2</Text>
          <Text style={styles.connectText}>
            Abre Tiempo real para conectar tu AutoSense por Bluetooth y guardar tu vehículo.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onOpenRealtime}
            style={({ pressed }) => [styles.connectButton, pressed ? styles.metricCardPressed : null]}
          >
            <Bluetooth color="#FFFFFF" size={18} strokeWidth={2.3} />
            <Text style={styles.connectButtonText}>Conectar AutoSense</Text>
          </Pressable>
          <View style={styles.connectHint}>
            <CarFront color={PENCIL.success} size={15} strokeWidth={2.2} />
            <Text style={styles.connectHintText}>Auto-scan al abrir Tiempo real</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { firebaseUser, profile } = useSession();
  const { trips } = useUserTrips(firebaseUser?.uid);
  const {
    hasRegisteredDevice,
    isLoading: isRegisteredDeviceLoading,
  } = useHasRegisteredDevice(firebaseUser?.uid);
  const [heroBlurProgress, setHeroBlurProgress] = useState(0);
  const latestTrip = trips[0] ?? null;
  const hasLiveObd = Boolean(
    profile?.realtime?.isConnected
      && profile.realtime.deviceLabel !== 'Demo OBD2',
  );
  const dashboard = isLegacySeededDashboard(profile?.dashboard) ? null : profile?.dashboard;
  const hasHistoricalDashboard = Boolean(
    dashboard
      && (
        dashboard.fuelPercent > 0
        || dashboard.remainingRangeKm > 0
        || dashboard.efficiencyScore > 0
        || dashboard.currentTripDistanceKm > 0
      ),
  );
  const shouldShowDashboard = hasRegisteredDevice || hasLiveObd || hasHistoricalDashboard;
  const alertCount = profile ? getAlertCount(profile.alerts) : 0;
  const priorityAlert = profile ? getPriorityAlert(profile.alerts) : null;
  const vehicleName = isLegacySeededVehicle(profile?.vehicle) ? null : profile?.vehicle?.name;
  const heroTitle = vehicleName ?? profile?.realtime?.deviceLabel ?? 'AutoSense';
  const fuelPercent = dashboard?.fuelPercent ?? 0;
  const remainingRangeKm = dashboard?.remainingRangeKm ?? 0;
  const drivingStyle = dashboard?.drivingStyle ?? 'Sin datos';
  const drivingStyleNote = dashboard?.drivingStyleNote ?? 'Esperando telemetría real';
  const efficiencyScore = dashboard?.efficiencyScore ?? 0;
  const efficiencyNote = dashboard?.efficiencyNote ?? 'Sin lectura real todavía';
  const currentTripDistance = dashboard?.currentTripDistanceKm ?? 0;
  const currentTripConsumption =
    dashboard?.currentTripConsumptionLabel ?? 'Sin datos';
  const prioritySubtitle = alertCount > 0
    ? priorityAlert?.subtitle ?? 'Revisión pendiente'
    : 'Sin alertas prioritarias';
  const savingsTip =
    dashboard?.savingsTip
    ?? 'Conecta AutoSense para calcular sugerencias reales de ahorro.';

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

  if (isRegisteredDeviceLoading && !hasLiveObd && !hasHistoricalDashboard) {
    return (
      <View style={styles.screen}>
        <StatusBar style="dark" />
      </View>
    );
  }

  if (!shouldShowDashboard) {
    return (
      <View style={styles.screen}>
        <StatusBar style="dark" />
        <ScrollView
          contentContainerStyle={[
            styles.connectScroll,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 108 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <ConnectObdHome onOpenRealtime={() => router.push('/realtime')} />
        </ScrollView>
      </View>
    );
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
                latestTrip
                  ? router.push({
                      pathname: '/trips/[tripId]',
                      params: {
                        origin: 'home',
                        tripId: latestTrip.id,
                      },
                    })
                  : router.push('/trips')
              }
              subtitle={currentTripConsumption}
              title="Viaje actual"
              value={`${Math.round(currentTripDistance)} km`}
            />

            <HomeMetricCard
              icon={<CircleAlert color={alertCount > 0 ? PENCIL.warning : PENCIL.success} size={16} strokeWidth={2.2} />}
              iconBackground={alertCount > 0 ? PENCIL.warningSoft : PENCIL.successSoft}
              iconColor={alertCount > 0 ? PENCIL.warning : PENCIL.success}
              onPress={() => router.push('/home/alerts')}
              subtitle={prioritySubtitle}
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
  connectScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  connectPage: {
    flex: 1,
    justifyContent: 'center',
  },
  connectHero: {
    minHeight: 540,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: 22,
    borderRadius: 30,
    borderCurve: 'continuous',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    boxShadow: '0 18px 46px rgba(15, 23, 42, 0.10)',
  },
  connectHeroImage: {
    position: 'absolute',
    top: -18,
    left: -22,
    right: -22,
    height: 300,
    opacity: 0.74,
  },
  connectImageWash: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 190,
    height: 150,
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  connectStatusPill: {
    position: 'absolute',
    top: 18,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  connectContent: {
    width: '100%',
    alignItems: 'center',
    gap: 13,
  },
  connectIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PENCIL.accentSoft,
    borderWidth: 1,
    borderColor: PENCIL.accentBorder,
  },
  connectKicker: {
    color: PENCIL.accent,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  connectTitle: {
    color: PENCIL.text,
    maxWidth: 280,
    textAlign: 'center',
    fontSize: 35,
    fontWeight: '900',
    lineHeight: 38,
  },
  connectText: {
    color: PENCIL.muted,
    maxWidth: 292,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  connectButton: {
    width: '100%',
    minHeight: 56,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: PENCIL.accent,
  },
  connectButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 20,
  },
  connectHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: PENCIL.successSoft,
    borderWidth: 1,
    borderColor: PENCIL.successBorder,
  },
  connectHintText: {
    color: PENCIL.success,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
});
