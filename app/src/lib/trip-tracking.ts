import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';
import { Timestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

import { db } from '@/lib/firebase-client';
import type { AutoSenseTripDoc, MockObdTelemetry, TripPoint } from '@/lib/autosense-data';

const ACTIVE_TRIP_KEY = 'autosense.activeTrip';
const LOCATION_TASK_NAME = 'autosense.tripLocation';

const MOCK_ROUTE: TripPoint[] = [
  { latitude: 8.9725, longitude: -79.5358 },
  { latitude: 8.9764, longitude: -79.5311 },
  { latitude: 8.9803, longitude: -79.5258 },
  { latitude: 8.9857, longitude: -79.5197 },
  { latitude: 8.9901, longitude: -79.5129 },
  { latitude: 8.9951, longitude: -79.5072 },
  { latitude: 8.9998, longitude: -79.5018 },
];

const TRIP_EVENTS: AutoSenseTripDoc['events'] = [
  {
    title: 'OBD2 conectado',
    subtitle: 'La sesión empezó de forma automática desde el adaptador.',
    icon: 'sparkles',
    tone: 'accent',
  },
  {
    title: 'Ruta en curso',
    subtitle: 'Se siguen agregando puntos mientras hay movimiento.',
    icon: 'route',
    tone: 'success',
  },
];

type ActiveTripSession = {
  userId: string;
  tripId: string;
  pointIndex: number;
  startedAt: string;
  startedFuelLiters: number;
  lastFuelLiters: number;
};

type LocationTaskPayload = {
  locations?: {
    coords?: {
      latitude: number;
      longitude: number;
    };
  }[];
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceBetweenPoints(start: TripPoint, end: TripPoint) {
  const earthRadiusKm = 6371;
  const deltaLatitude = toRadians(end.latitude - start.latitude);
  const deltaLongitude = toRadians(end.longitude - start.longitude);
  const latitudeStart = toRadians(start.latitude);
  const latitudeEnd = toRadians(end.latitude);

  const haversine =
    Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2)
    + Math.cos(latitudeStart)
      * Math.cos(latitudeEnd)
      * Math.sin(deltaLongitude / 2)
      * Math.sin(deltaLongitude / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

if (__DEV__) {
  const km = distanceBetweenPoints(
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 1 },
  );

  // ponytail: tiny runtime check so the route math fails loudly if we break it.
  if (km < 110 || km > 112) {
    throw new Error('trip-tracking distance sanity check failed');
  }
}

function formatClock(date: Date) {
  return date.toLocaleTimeString('es-PA', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDateLabel(date: Date) {
  return `Hoy · ${formatClock(date)}`;
}

function formatDistance(distanceKm: number) {
  return `${distanceKm.toFixed(1)} km`;
}

function formatFuel(consumedLiters: number) {
  return `${consumedLiters.toFixed(1)} L`;
}

function formatDurationLabel(durationMinutes: number) {
  return `${Math.max(1, durationMinutes)}m`;
}

function getTripRef(userId: string, tripId: string) {
  return doc(db, 'users', userId, 'trips', tripId);
}

async function readActiveTripSession() {
  const rawValue = await SecureStore.getItemAsync(ACTIVE_TRIP_KEY);
  return rawValue ? (JSON.parse(rawValue) as ActiveTripSession) : null;
}

async function writeActiveTripSession(session: ActiveTripSession | null) {
  if (!session) {
    await SecureStore.deleteItemAsync(ACTIVE_TRIP_KEY);
    return;
  }

  await SecureStore.setItemAsync(ACTIVE_TRIP_KEY, JSON.stringify(session));
}

function buildTripDocument(
  tripId: string,
  startedAt: Date,
  routePath: TripPoint[],
): AutoSenseTripDoc {
  const distanceKm = distanceBetweenPoints(routePath[0], routePath[1]);
  const fuelLiters = 0;

  return {
    id: tripId,
    title: 'Viaje automático',
    subtitle: formatDateLabel(startedAt),
    period: 'Hoy',
    route: 'Ruta automática',
    summary: `1 min · ${formatDistance(distanceKm)} · ${formatFuel(fuelLiters)}`,
    score: 89,
    scoreDescription: 'Sesión iniciada automáticamente desde la lectura OBD2.',
    distanceLabel: formatDistance(distanceKm),
    distanceKm,
    durationLabel: '1m',
    durationMinutes: 1,
    fuelLabel: formatFuel(fuelLiters),
    fuelLiters,
    efficiencyLabel: '--',
    routeTitle: 'Ruta registrada',
    routeSummary: 'OBD2 conectado · tracking automático',
    category: 'city',
    statusLabel: 'En curso',
    timeLabel: '1 min',
    cameraCenter: routePath[1],
    routePath,
    startPoint: routePath[0],
    endPoint: routePath[1],
    events: TRIP_EVENTS,
    startedAt: Timestamp.fromDate(startedAt),
    endedAt: null,
  };
}

async function upsertTripDocument(
  session: ActiveTripSession,
  nextPoint: TripPoint,
  telemetry?: MockObdTelemetry,
  endedAt?: Date,
) {
  const tripRef = getTripRef(session.userId, session.tripId);
  const tripSnapshot = await getDoc(tripRef);

  if (!tripSnapshot.exists()) {
    return;
  }

  const trip = tripSnapshot.data() as AutoSenseTripDoc;
  const routePath = [...trip.routePath, nextPoint].slice(-200);
  const distanceKm = routePath.reduce((totalDistance, point, index) => {
    if (index === 0) {
      return 0;
    }

    return totalDistance + distanceBetweenPoints(routePath[index - 1], point);
  }, 0);
  const startedAt = trip.startedAt.toDate();
  const endDate = endedAt ?? new Date();
  const durationMinutes = Math.max(
    1,
    Math.round((endDate.getTime() - startedAt.getTime()) / 60000),
  );
  const consumedFuel = telemetry
    ? Math.max(0, session.startedFuelLiters - telemetry.fuelLiters)
    : trip.fuelLiters;
  const efficiencyLabel = consumedFuel > 0
    ? (distanceKm / consumedFuel).toFixed(1)
    : trip.efficiencyLabel;

  await setDoc(tripRef, {
    ...trip,
    summary: `${durationMinutes} min · ${formatDistance(distanceKm)} · ${formatFuel(consumedFuel)}`,
    distanceLabel: formatDistance(distanceKm),
    distanceKm,
    durationLabel: formatDurationLabel(durationMinutes),
    durationMinutes,
    fuelLabel: formatFuel(consumedFuel),
    fuelLiters: consumedFuel,
    efficiencyLabel,
    statusLabel: endedAt ? 'Completado' : 'En curso',
    timeLabel: `${durationMinutes} min`,
    cameraCenter: nextPoint,
    routePath,
    endPoint: nextPoint,
    endedAt: endedAt ? Timestamp.fromDate(endedAt) : null,
  });
}

async function startBackgroundLocationUpdates() {
  try {
    const foreground = await Location.requestForegroundPermissionsAsync();

    if (!foreground.granted) {
      return;
    }

    const background = await Location.requestBackgroundPermissionsAsync();

    if (!background.granted) {
      return;
    }

    const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);

    if (isRunning) {
      return;
    }

    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      activityType: Location.ActivityType.AutomotiveNavigation,
      deferredUpdatesInterval: 60000,
      distanceInterval: 50,
      pausesUpdatesAutomatically: true,
      ...(Platform.OS === 'android'
        ? {
            foregroundService: {
              notificationTitle: 'AutoSense activo',
              notificationBody: 'Seguimos tu viaje en segundo plano.',
              notificationColor: '#2563EB',
            },
          }
        : {}),
    });
  } catch {
    // ponytail: best-effort background GPS, the live mock path still keeps trips testable.
  }
}

async function stopBackgroundLocationUpdates() {
  try {
    const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);

    if (isRunning) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  } catch {
    // ignore cleanup failures
  }
}

function getNextMockPoint(pointIndex: number) {
  if (pointIndex < MOCK_ROUTE.length) {
    return MOCK_ROUTE[pointIndex];
  }

  return MOCK_ROUTE[MOCK_ROUTE.length - 1]!;
}

export async function stopTripTracking(userId: string) {
  const session = await readActiveTripSession();

  if (!session || session.userId !== userId) {
    await stopBackgroundLocationUpdates();
    return;
  }

  await upsertTripDocument(
    session,
    getNextMockPoint(session.pointIndex),
    undefined,
    new Date(),
  );
  await writeActiveTripSession(null);
  await stopBackgroundLocationUpdates();
}

async function startTripTracking(userId: string, telemetry: MockObdTelemetry) {
  const existingSession = await readActiveTripSession();

  if (existingSession?.userId === userId) {
    return existingSession;
  }

  const tripId = `trip-${Date.now()}`;
  const startedAt = new Date();
  const routePath = [MOCK_ROUTE[0]!, MOCK_ROUTE[1]!];
  const session: ActiveTripSession = {
    userId,
    tripId,
    pointIndex: 1,
    startedAt: startedAt.toISOString(),
    startedFuelLiters: telemetry.fuelLiters,
    lastFuelLiters: telemetry.fuelLiters,
  };

  await setDoc(
    getTripRef(userId, tripId),
    buildTripDocument(tripId, startedAt, routePath),
  );
  await writeActiveTripSession(session);
  await startBackgroundLocationUpdates();

  return session;
}

export async function syncTripTracking(
  userId: string,
  isConnected: boolean,
  telemetry: MockObdTelemetry,
) {
  const vehicleMoving = telemetry.speed >= 8;
  const engineActive = telemetry.rpm >= 900 || telemetry.engineLoad >= 5 || telemetry.throttle >= 4;
  let session = await readActiveTripSession();

  if (!isConnected) {
    if (session?.userId === userId) {
      await stopTripTracking(userId);
    }

    return;
  }

  if (!session && vehicleMoving && engineActive) {
    session = await startTripTracking(userId, telemetry);
  }

  if (!session || session.userId !== userId) {
    return;
  }

  const fuelChanged = Math.abs(telemetry.fuelLiters - session.lastFuelLiters) >= 0.1;

  if (!vehicleMoving || !(fuelChanged || engineActive)) {
    return;
  }

  const nextPoint = getNextMockPoint(session.pointIndex + 1);

  await upsertTripDocument(session, nextPoint, telemetry);
  await writeActiveTripSession({
    ...session,
    pointIndex: session.pointIndex + 1,
    lastFuelLiters: telemetry.fuelLiters,
  });
}

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    return;
  }

  const session = await readActiveTripSession();
  const payload = data as LocationTaskPayload | undefined;
  const firstLocation = payload?.locations?.[0]?.coords;

  if (!session || !firstLocation) {
    return;
  }

  try {
    await upsertTripDocument(session, {
      latitude: firstLocation.latitude,
      longitude: firstLocation.longitude,
    });
  } catch {
    // ponytail: background GPS writes are opportunistic; foreground sync already persists the trip.
  }
});
