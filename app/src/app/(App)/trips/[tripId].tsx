import { type ComponentType, useEffect, useState } from 'react';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { router, useLocalSearchParams } from 'expo-router';
import { Card } from 'heroui-native';
import {
  Fuel,
  Gauge,
  GraduationCap,
  MapPinned,
  Route,
  Sparkles,
  TimerReset,
  Zap,
} from 'lucide-react-native';
import { Platform, StyleSheet, Text, View } from 'react-native';

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
import { type AutoSenseTripDoc, useTrip } from '@/lib/autosense-data';
import { backOrFallback } from '@/lib/navigation';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const canRenderNativeMap = !isExpoGo && (Platform.OS === 'ios' || Platform.OS === 'android');

function getTripBadgeIcon(trip: AutoSenseTripDoc) {
  if (trip.category === 'university') {
    return <GraduationCap color={PENCIL.accent} size={19} strokeWidth={2.1} />;
  }

  return <MapPinned color={PENCIL.accent} size={19} strokeWidth={2.1} />;
}

function getEventToneColors(tone: AutoSenseTripDoc['events'][number]['tone']) {
  switch (tone) {
    case 'warning':
      return {
        backgroundColor: PENCIL.warningSoft,
        iconColor: PENCIL.warning,
      };
    case 'success':
      return {
        backgroundColor: PENCIL.successSoft,
        iconColor: PENCIL.success,
      };
    default:
      return {
        backgroundColor: PENCIL.accentSoft,
        iconColor: PENCIL.accent,
      };
  }
}

function getEventIcon(
  icon: AutoSenseTripDoc['events'][number]['icon'],
  color: string,
) {
  switch (icon) {
    case 'timer':
      return <TimerReset color={color} size={18} strokeWidth={2.1} />;
    case 'route':
      return <Route color={color} size={18} strokeWidth={2.1} />;
    case 'zap':
      return <Zap color={color} size={18} strokeWidth={2.1} />;
    case 'gauge':
      return <Gauge color={color} size={18} strokeWidth={2.1} />;
    default:
      return <Sparkles color={color} size={18} strokeWidth={2.1} />;
  }
}

function TripRouteMap({ trip }: { trip: AutoSenseTripDoc }) {
  const [mapNamespace, setMapNamespace] = useState<{
    kind: 'apple' | 'google';
    module: any;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (!canRenderNativeMap) {
      return () => {
        isMounted = false;
      };
    }

    import('expo-maps').then((module) => {
      if (!isMounted) {
        return;
      }

      if (Platform.OS === 'ios') {
        setMapNamespace({ kind: 'apple', module: module.AppleMaps });
        return;
      }

      setMapNamespace({ kind: 'google', module: module.GoogleMaps });
    });

    return () => {
      isMounted = false;
    };
  }, []);

  if (!mapNamespace) {
    return (
      <View style={styles.mapFallback}>
        <IconBubble
          backgroundColor={PENCIL.accentSoft}
          borderColor={PENCIL.accentSoft}
          size={44}
        >
          <MapPinned color={PENCIL.accent} size={20} strokeWidth={2.1} />
        </IconBubble>

        <View style={styles.mapFallbackCopy}>
          <Text style={styles.mapFallbackTitle}>Mapa real disponible en dev build</Text>
          <Text style={styles.mapFallbackText}>
            Expo Go no incluye expo-maps. En el development build esta tarjeta
            muestra la ruta nativa.
          </Text>
        </View>
      </View>
    );
  }

  if (mapNamespace.kind === 'apple') {
    const AppleMapView = mapNamespace.module.View as ComponentType<any>;

    return (
      <AppleMapView
        cameraPosition={{
          coordinates: trip.cameraCenter,
          zoom: 12.6,
        }}
        colorScheme={mapNamespace.module.MapColorScheme.LIGHT}
        markers={[
          {
            id: 'start',
            coordinates: trip.startPoint,
            title: 'Inicio',
            systemImage: 'car.fill',
            tintColor: '#2563EB',
          },
          {
            id: 'end',
            coordinates: trip.endPoint,
            title: trip.title,
            systemImage: trip.category === 'university' ? 'graduationcap.fill' : 'flag.fill',
            tintColor: '#137C6B',
          },
        ]}
        polylines={[
          {
            id: 'route',
            color: '#2563EB',
            coordinates: trip.routePath,
            width: 6,
          },
        ]}
        properties={{
          elevation: mapNamespace.module.MapStyleElevation.REALISTIC,
          emphasis: 'MUTED',
          isTrafficEnabled: false,
          mapType: mapNamespace.module.MapType.STANDARD,
          selectionEnabled: false,
        }}
        style={styles.mapView}
        uiSettings={{
          compassEnabled: false,
          scaleBarEnabled: false,
          togglePitchEnabled: false,
        }}
      />
    );
  }

  const GoogleMapView = mapNamespace.module.View as ComponentType<any>;

  return (
    <GoogleMapView
      cameraPosition={{
        coordinates: trip.cameraCenter,
        zoom: 12.6,
      }}
      colorScheme={mapNamespace.module.MapColorScheme.LIGHT}
      markers={[
        {
          id: 'start',
          coordinates: trip.startPoint,
          title: 'Inicio',
        },
        {
          id: 'end',
          coordinates: trip.endPoint,
          title: trip.title,
        },
      ]}
      polylines={[
        {
          id: 'route',
          color: '#2563EB',
          coordinates: trip.routePath,
          width: 6,
        },
      ]}
      properties={{
        isTrafficEnabled: false,
        mapType: mapNamespace.module.MapType.NORMAL,
        selectionEnabled: false,
      }}
      style={styles.mapView}
      uiSettings={{
        compassEnabled: false,
        mapToolbarEnabled: false,
        rotateGesturesEnabled: false,
        scaleBarEnabled: false,
        tiltGesturesEnabled: false,
        zoomControlsEnabled: false,
      }}
    />
  );
}

export default function TripDetailScreen() {
  const { firebaseUser } = useSession();
  const params = useLocalSearchParams<{ origin?: string; tripId?: string }>();
  const tripId = typeof params.tripId === 'string' ? params.tripId : 'today';
  const origin = typeof params.origin === 'string' ? params.origin : undefined;
  const { trip } = useTrip(firebaseUser?.uid, tripId);

  if (!trip) {
    return null;
  }

  const handleBack = () => {
    if (origin === 'home') {
      router.replace('/home');
      return;
    }

    backOrFallback('/trips');
  };

  return (
    <AppScreen
      contentTopPadding={8}
      header={<DetailHeader onBack={handleBack} subtitle={trip.subtitle} title={trip.title} />}
    >
      <View style={styles.page}>
        <SurfaceCard>
          <View style={styles.scoreCard}>
            <View style={styles.scoreHeader}>
              <View style={styles.scoreCopy}>
                <View style={styles.scoreValueRow}>
                  <Text style={styles.scoreValue}>{trip.score}</Text>
                  <Text style={styles.scoreScale}>de 100</Text>
                </View>
                <Text style={styles.scoreDescription}>{trip.scoreDescription}</Text>
              </View>

              <View style={styles.scoreIcon}>
                <Sparkles color={PENCIL.warning} size={18} strokeWidth={2.2} />
              </View>
            </View>

            <ProgressBars
              activeColor={PENCIL.accent}
              inactiveColor="#DCEAE7"
              values={[
                1,
                1,
                1,
                trip.score >= 90 ? 1 : 0.6,
                trip.score >= 95 ? 1 : 0,
              ]}
            />
          </View>
        </SurfaceCard>

        <Card className="p-0" style={styles.mapCardSurface}>
          <Card.Body className="p-0">
            <View style={styles.mapCard}>
              <View style={styles.mapHeader}>
                <View style={styles.mapHeaderCopy}>
                  <Text style={styles.mapLabel}>Ruta</Text>
                  <Text style={styles.mapTitle}>{trip.routeTitle}</Text>
                  <Text style={styles.mapSummary}>{trip.routeSummary}</Text>
                </View>

                <IconBubble
                  backgroundColor={PENCIL.accentSoft}
                  borderColor={PENCIL.accentSoft}
                  size={42}
                >
                  {getTripBadgeIcon(trip)}
                </IconBubble>
              </View>

              <View style={styles.mapFrame}>
                <TripRouteMap trip={trip} />
              </View>
            </View>
          </Card.Body>
        </Card>

        <View style={styles.metricGrid}>
          <CompactMetricCard
            icon={<Route color={PENCIL.accent} size={16} strokeWidth={2.1} />}
            iconBackground={PENCIL.accentSoft}
            iconColor={PENCIL.accent}
            subtitle="Recorrido"
            title="Distancia"
            value={trip.distanceLabel}
          />
          <CompactMetricCard
            icon={<TimerReset color={PENCIL.success} size={16} strokeWidth={2.1} />}
            iconBackground={PENCIL.successSoft}
            iconColor={PENCIL.success}
            subtitle="Total"
            title="Tiempo"
            value={trip.durationLabel}
          />
          <CompactMetricCard
            icon={<Fuel color={PENCIL.warning} size={16} strokeWidth={2.1} />}
            iconBackground={PENCIL.warningSoft}
            iconColor={PENCIL.warning}
            subtitle="Estimado"
            title="Combustible"
            value={trip.fuelLabel}
          />
          <CompactMetricCard
            icon={<Gauge color={PENCIL.accent} size={16} strokeWidth={2.1} />}
            iconBackground={PENCIL.accentSoft}
            iconColor={PENCIL.accent}
            subtitle="Promedio"
            title="Eficiencia"
            value={trip.efficiencyLabel}
          />
        </View>

        <View style={styles.eventSection}>
          <Text style={styles.sectionTitle}>Eventos del recorrido</Text>

          <View style={styles.eventStack}>
            {trip.events.map((event) => {
              const colors = getEventToneColors(event.tone);

              return (
                <Card key={event.title} className="p-0" style={styles.eventCardSurface}>
                  <Card.Body className="p-0">
                    <View style={styles.eventCard}>
                      <IconBubble
                        backgroundColor={colors.backgroundColor}
                        borderColor={colors.backgroundColor}
                        size={40}
                      >
                        {getEventIcon(event.icon, colors.iconColor)}
                      </IconBubble>

                      <View style={styles.eventCopy}>
                        <Text style={styles.eventTitle}>{event.title}</Text>
                        <Text style={styles.eventSubtitle}>{event.subtitle}</Text>
                      </View>
                    </View>
                  </Card.Body>
                </Card>
              );
            })}
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
  mapCardSurface: {
    backgroundColor: '#FFFFFF',
    borderCurve: 'continuous',
    borderRadius: 24,
    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.10), 0 2px 8px rgba(15, 23, 42, 0.05)',
  },
  mapCard: {
    gap: 14,
    padding: 14,
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  mapHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  mapLabel: {
    color: PENCIL.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  mapTitle: {
    color: PENCIL.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
  },
  mapSummary: {
    color: PENCIL.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  mapFrame: {
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PENCIL.border,
    backgroundColor: '#F8FAFC',
    minHeight: 260,
  },
  mapView: {
    width: '100%',
    height: 260,
  },
  mapFallback: {
    flex: 1,
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 18,
  },
  mapFallbackCopy: {
    gap: 4,
    alignItems: 'center',
  },
  mapFallbackTitle: {
    color: PENCIL.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  mapFallbackText: {
    color: PENCIL.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    textAlign: 'center',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  eventSection: {
    gap: 10,
  },
  sectionTitle: {
    color: PENCIL.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  eventStack: {
    gap: 10,
  },
  eventCardSurface: {
    backgroundColor: '#FFFFFF',
    borderCurve: 'continuous',
    borderRadius: 22,
    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.10), 0 2px 8px rgba(15, 23, 42, 0.05)',
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  eventCopy: {
    flex: 1,
    gap: 2,
  },
  eventTitle: {
    color: PENCIL.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  eventSubtitle: {
    color: PENCIL.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
});
