import { type ComponentType, type ReactNode, useEffect, useState } from 'react';
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

type TripPoint = {
  latitude: number;
  longitude: number;
};

type TripEvent = {
  title: string;
  subtitle: string;
  icon: ReactNode;
  iconBackground: string;
};

type TripRecord = {
  title: string;
  subtitle: string;
  score: string;
  scoreDescription: string;
  distance: string;
  duration: string;
  fuel: string;
  efficiency: string;
  routeTitle: string;
  routeSummary: string;
  cameraCenter: TripPoint;
  routePath: TripPoint[];
  startPoint: TripPoint;
  endPoint: TripPoint;
  events: TripEvent[];
};

const TRIPS: Record<string, TripRecord> = {
  today: {
    title: 'Universidad',
    subtitle: 'Hoy · 8:10 AM',
    score: '91',
    scoreDescription: 'Recorrido estable con buen control de aceleración.',
    distance: '28.4 km',
    duration: '34m',
    fuel: '4.8 L',
    efficiency: '8.1',
    routeTitle: 'Ruta Universidad',
    routeSummary: 'Campus central · 3 semáforos · tráfico ligero',
    cameraCenter: { latitude: 8.9974, longitude: -79.5168 },
    routePath: [
      { latitude: 8.9848, longitude: -79.5349 },
      { latitude: 8.9886, longitude: -79.5297 },
      { latitude: 8.9928, longitude: -79.5244 },
      { latitude: 8.9981, longitude: -79.5185 },
      { latitude: 9.0036, longitude: -79.5107 },
    ],
    startPoint: { latitude: 8.9848, longitude: -79.5349 },
    endPoint: { latitude: 9.0036, longitude: -79.5107 },
    events: [
      {
        title: 'Salida limpia',
        subtitle: 'Arranque progresivo sin pico brusco de aceleración.',
        icon: <Sparkles color={PENCIL.accent} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.accentSoft,
      },
      {
        title: 'Tráfico moderado',
        subtitle: 'Hubo una zona lenta, pero mantuviste el consumo controlado.',
        icon: <TimerReset color={PENCIL.warning} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.warningSoft,
      },
      {
        title: 'Llegada eficiente',
        subtitle: 'Cierre del trayecto con frenado estable y buen score.',
        icon: <Route color={PENCIL.success} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.successSoft,
      },
    ],
  },
  yesterday: {
    title: 'Centro',
    subtitle: 'Ayer · 6:40 PM',
    score: '88',
    scoreDescription: 'Ruta urbana con algo de frenado en tráfico denso.',
    distance: '19.1 km',
    duration: '26m',
    fuel: '3.6 L',
    efficiency: '7.6',
    routeTitle: 'Ruta Centro',
    routeSummary: 'Zona comercial · hora pico · semáforos densos',
    cameraCenter: { latitude: 8.9828, longitude: -79.5214 },
    routePath: [
      { latitude: 8.9725, longitude: -79.5358 },
      { latitude: 8.9764, longitude: -79.5311 },
      { latitude: 8.9803, longitude: -79.5258 },
      { latitude: 8.9857, longitude: -79.5197 },
      { latitude: 8.9901, longitude: -79.5129 },
    ],
    startPoint: { latitude: 8.9725, longitude: -79.5358 },
    endPoint: { latitude: 8.9901, longitude: -79.5129 },
    events: [
      {
        title: 'Cruce con carga',
        subtitle: 'Se detectó reducción fuerte por tráfico pesado.',
        icon: <Zap color={PENCIL.warning} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.warningSoft,
      },
      {
        title: 'Tramo contenido',
        subtitle: 'Recuperaste estabilidad en el segundo segmento.',
        icon: <Sparkles color={PENCIL.accent} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.accentSoft,
      },
      {
        title: 'Cierre correcto',
        subtitle: 'Parada final sin exceso de ralentí.',
        icon: <Route color={PENCIL.success} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.successSoft,
      },
    ],
  },
  north: {
    title: 'Ruta norte',
    subtitle: '28 may · 5:22 PM',
    score: '95',
    scoreDescription: 'Trayecto largo con conducción muy constante.',
    distance: '41.0 km',
    duration: '49m',
    fuel: '6.1 L',
    efficiency: '8.9',
    routeTitle: 'Ruta norte',
    routeSummary: 'Corredor norte · flujo estable · ahorro alto',
    cameraCenter: { latitude: 9.0415, longitude: -79.4981 },
    routePath: [
      { latitude: 9.0122, longitude: -79.5318 },
      { latitude: 9.0196, longitude: -79.5244 },
      { latitude: 9.0293, longitude: -79.5156 },
      { latitude: 9.0438, longitude: -79.5008 },
      { latitude: 9.0577, longitude: -79.4871 },
    ],
    startPoint: { latitude: 9.0122, longitude: -79.5318 },
    endPoint: { latitude: 9.0577, longitude: -79.4871 },
    events: [
      {
        title: 'Aceleración óptima',
        subtitle: 'Mantienes buena inercia en tramos de velocidad media.',
        icon: <Sparkles color={PENCIL.accent} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.accentSoft,
      },
      {
        title: 'Crucero estable',
        subtitle: 'Poca variación de velocidad durante el corredor.',
        icon: <Gauge color={PENCIL.success} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.successSoft,
      },
      {
        title: 'Llegada limpia',
        subtitle: 'Cierre sin frenadas agresivas en la salida norte.',
        icon: <Route color={PENCIL.success} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.successSoft,
      },
    ],
  },
  home: {
    title: 'Casa',
    subtitle: '26 may · 7:15 PM',
    score: '86',
    scoreDescription: 'Ruta corta con un par de frenadas urbanas.',
    distance: '12.8 km',
    duration: '21m',
    fuel: '0.9 L',
    efficiency: '7.2',
    routeTitle: 'Ruta Casa',
    routeSummary: 'Barrio residencial · pendientes suaves · poco tráfico',
    cameraCenter: { latitude: 8.9691, longitude: -79.5475 },
    routePath: [
      { latitude: 8.9612, longitude: -79.5561 },
      { latitude: 8.9643, longitude: -79.5524 },
      { latitude: 8.9676, longitude: -79.5489 },
      { latitude: 8.9704, longitude: -79.5453 },
      { latitude: 8.9731, longitude: -79.5414 },
    ],
    startPoint: { latitude: 8.9612, longitude: -79.5561 },
    endPoint: { latitude: 8.9731, longitude: -79.5414 },
    events: [
      {
        title: 'Inicio suave',
        subtitle: 'La salida residencial mantiene buen control.',
        icon: <Sparkles color={PENCIL.accent} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.accentSoft,
      },
      {
        title: 'Pendiente corta',
        subtitle: 'Hubo un tramo con mayor demanda de combustible.',
        icon: <Zap color={PENCIL.warning} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.warningSoft,
      },
      {
        title: 'Entrada estable',
        subtitle: 'Llegada final sin exceso de consumo.',
        icon: <Route color={PENCIL.success} size={18} strokeWidth={2.1} />,
        iconBackground: PENCIL.successSoft,
      },
    ],
  },
};

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const canRenderNativeAppleMap = Platform.OS === 'ios' && !isExpoGo;

function TripRouteMap({ trip }: { trip: TripRecord }) {
  const [appleMapsModule, setAppleMapsModule] = useState<any | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (!canRenderNativeAppleMap) {
      return () => {
        isMounted = false;
      };
    }

    import('expo-maps').then((module) => {
      if (isMounted) {
        setAppleMapsModule(module.AppleMaps);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const MapView = appleMapsModule?.View as ComponentType<any> | undefined;

  if (!MapView) {
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
            Expo Go no incluye `expo-maps`. En el development build iOS esta tarjeta muestra Apple Maps con la ruta dibujada.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <MapView
      cameraPosition={{
        coordinates: trip.cameraCenter,
        zoom: 12.6,
      }}
      colorScheme={appleMapsModule.MapColorScheme.LIGHT}
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
          systemImage: trip.title === 'Universidad' ? 'graduationcap.fill' : 'flag.fill',
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
        elevation: appleMapsModule.MapStyleElevation.REALISTIC,
        emphasis: 'MUTED',
        isTrafficEnabled: false,
        mapType: appleMapsModule.MapType.STANDARD,
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

export default function TripDetailScreen() {
  const params = useLocalSearchParams<{ origin?: string; tripId?: string }>();
  const tripId = typeof params.tripId === 'string' ? params.tripId : 'today';
  const origin = typeof params.origin === 'string' ? params.origin : undefined;
  const trip = TRIPS[tripId] ?? TRIPS.today;

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
              values={[1, 1, 1, Number(trip.score) >= 90 ? 1 : 0.6, Number(trip.score) >= 95 ? 1 : 0]}
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
                  {trip.title === 'Universidad' ? (
                    <GraduationCap color={PENCIL.accent} size={19} strokeWidth={2.1} />
                  ) : (
                    <MapPinned color={PENCIL.accent} size={19} strokeWidth={2.1} />
                  )}
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
            value={trip.distance}
          />
          <CompactMetricCard
            icon={<TimerReset color={PENCIL.success} size={16} strokeWidth={2.1} />}
            iconBackground={PENCIL.successSoft}
            iconColor={PENCIL.success}
            subtitle="Total"
            title="Tiempo"
            value={trip.duration}
          />
          <CompactMetricCard
            icon={<Fuel color={PENCIL.warning} size={16} strokeWidth={2.1} />}
            iconBackground={PENCIL.warningSoft}
            iconColor={PENCIL.warning}
            subtitle="Estimado"
            title="Combustible"
            value={trip.fuel}
          />
          <CompactMetricCard
            icon={<Gauge color={PENCIL.accent} size={16} strokeWidth={2.1} />}
            iconBackground={PENCIL.accentSoft}
            iconColor={PENCIL.accent}
            subtitle="Promedio"
            title="Eficiencia"
            value={trip.efficiency}
          />
        </View>

        <View style={styles.eventSection}>
          <Text style={styles.sectionTitle}>Eventos del recorrido</Text>

          <View style={styles.eventStack}>
            {trip.events.map((event) => (
              <Card key={event.title} className="p-0" style={styles.eventCardSurface}>
                <Card.Body className="p-0">
                  <View style={styles.eventCard}>
                    <IconBubble
                      backgroundColor={event.iconBackground}
                      borderColor={event.iconBackground}
                      size={40}
                    >
                      {event.icon}
                    </IconBubble>

                    <View style={styles.eventCopy}>
                      <Text style={styles.eventTitle}>{event.title}</Text>
                      <Text style={styles.eventSubtitle}>{event.subtitle}</Text>
                    </View>
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
  mapCardSurface: {
    backgroundColor: '#FFFFFF',
    borderCurve: 'continuous',
    borderRadius: 24,
    boxShadow: '0 12px 28px rgba(15, 23, 42, 0.10), 0 2px 8px rgba(15, 23, 42, 0.06)',
  },
  mapCard: {
    gap: 12,
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
    gap: 3,
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
    lineHeight: 23,
    fontWeight: '800',
  },
  mapSummary: {
    color: PENCIL.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  mapFrame: {
    height: 220,
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: '#EEF6FF',
  },
  mapView: {
    flex: 1,
  },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 18,
    backgroundColor: '#EEF6FF',
  },
  mapFallbackCopy: {
    gap: 4,
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
  eventStack: {
    gap: 10,
  },
  sectionTitle: {
    color: PENCIL.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
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
