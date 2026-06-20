import { useEffect, useMemo, useState } from 'react';
import { type User } from 'firebase/auth';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase-client';

export type AlertId =
  | 'battery'
  | 'brakes'
  | 'oil'
  | 'tire'
  | 'efficiency';

export type AlertTone = 'danger' | 'warning' | 'accent' | 'success';
export type TripCategory = 'university' | 'city' | 'north' | 'home';
export type TripEventIcon = 'sparkles' | 'timer' | 'route' | 'zap' | 'gauge';
export type TripEventTone = 'accent' | 'warning' | 'success';

export type TripPoint = {
  latitude: number;
  longitude: number;
};

export type AutoSenseAlertSnapshot = {
  title: string;
  subtitle: string;
  value: string;
  tone: AlertTone;
};

export type AutoSenseUserDoc = {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
  provider: 'password' | 'google.com';
  phoneNumber: string;
  roleLabel: string;
  vehicle: {
    name: string;
    summary: string;
    statusLabel: string;
    fuelTankLiters: number;
  };
  dashboard: {
    fuelPercent: number;
    remainingRangeKm: number;
    drivingStyle: string;
    drivingStyleNote: string;
    efficiencyScore: number;
    efficiencyNote: string;
    currentTripDistanceKm: number;
    currentTripConsumptionLabel: string;
    savingsTip: string;
    savingsPercent: number;
  };
  settings: {
    speedUnit: 'km/h' | 'mph';
    temperatureUnit: '°C' | '°F';
    consumptionUnit: 'L/100 km' | 'km/L';
    alertsMode: 'Activado' | 'Solo críticas';
    dataMode: 'Cloud sync' | 'Solo local';
    privacyMode: 'Rutas privadas' | 'Compartir';
  };
  efficiency: {
    score: number;
    accelerationPercent: number;
    brakingPercent: number;
    idleMinutes: number;
    economyValue: number;
  };
  alerts: Record<AlertId, AutoSenseAlertSnapshot>;
  realtime: {
    isConnected: boolean;
    statusLabel: string;
    signalLabel: string;
    deviceLabel: string;
    lastConnectedAt?: Timestamp | null;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type AutoSenseTripEvent = {
  title: string;
  subtitle: string;
  icon: TripEventIcon;
  tone: TripEventTone;
};

export type AutoSenseTripDoc = {
  id: string;
  title: string;
  subtitle: string;
  period: string;
  route: string;
  summary: string;
  score: number;
  scoreDescription: string;
  distanceLabel: string;
  distanceKm?: number;
  durationLabel: string;
  durationMinutes: number;
  fuelLabel: string;
  fuelLiters: number;
  efficiencyLabel: string;
  routeTitle: string;
  routeSummary: string;
  category: TripCategory;
  statusLabel: string;
  timeLabel: string;
  cameraCenter: TripPoint;
  routePath: TripPoint[];
  startPoint: TripPoint;
  endPoint: TripPoint;
  events: AutoSenseTripEvent[];
  startedAt: Timestamp;
  endedAt?: Timestamp | null;
};

export type MockObdTelemetry = {
  speed: number;
  rpm: number;
  engineTemp: number;
  fuelLiters: number;
  engineLoad: number;
  voltage: number;
  throttle: number;
  intakeTemp: number;
};

const USERS_COLLECTION = 'users';
const TRIPS_SUBCOLLECTION = 'trips';

const DEFAULT_ALERTS: Record<AlertId, AutoSenseAlertSnapshot> = {
  battery: {
    title: 'Batería',
    subtitle: 'Voltaje bajo detectado',
    value: 'Crítica',
    tone: 'danger',
  },
  brakes: {
    title: 'Frenos',
    subtitle: 'Revisión recomendada',
    value: 'Media',
    tone: 'warning',
  },
  oil: {
    title: 'Aceite',
    subtitle: 'Servicio próximo',
    value: 'Media',
    tone: 'warning',
  },
  tire: {
    title: 'Llantas',
    subtitle: 'Presión irregular',
    value: 'Baja',
    tone: 'accent',
  },
  efficiency: {
    title: 'Consumo',
    subtitle: 'El uso subió esta semana',
    value: 'Ver',
    tone: 'success',
  },
};

const DEFAULT_TRIPS: AutoSenseTripDoc[] = [
  {
    id: 'today',
    title: 'Universidad',
    subtitle: 'Hoy · 8:10 AM',
    period: 'Hoy',
    route: 'Universidad',
    summary: '34 min · 28.4 km · 4.8 L',
    score: 91,
    scoreDescription: 'Recorrido estable con buen control de aceleración.',
    distanceLabel: '28.4 km',
    durationLabel: '34m',
    durationMinutes: 34,
    fuelLabel: '4.8 L',
    fuelLiters: 4.8,
    efficiencyLabel: '8.1',
    routeTitle: 'Ruta Universidad',
    routeSummary: 'Campus central · 3 semáforos · tráfico ligero',
    category: 'university',
    statusLabel: 'Alta',
    timeLabel: '34 min',
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
        icon: 'sparkles',
        tone: 'accent',
      },
      {
        title: 'Tráfico moderado',
        subtitle: 'Hubo una zona lenta, pero mantuviste el consumo controlado.',
        icon: 'timer',
        tone: 'warning',
      },
      {
        title: 'Llegada eficiente',
        subtitle: 'Cierre del trayecto con frenado estable y buen score.',
        icon: 'route',
        tone: 'success',
      },
    ],
    startedAt: Timestamp.fromDate(new Date('2026-06-19T08:10:00-05:00')),
  },
  {
    id: 'yesterday',
    title: 'Centro',
    subtitle: 'Ayer · 6:40 PM',
    period: 'Ayer',
    route: 'Centro',
    summary: '26 min · 19.1 km · 3.6 L',
    score: 88,
    scoreDescription: 'Ruta urbana con algo de frenado en tráfico denso.',
    distanceLabel: '19.1 km',
    durationLabel: '26m',
    durationMinutes: 26,
    fuelLabel: '3.6 L',
    fuelLiters: 3.6,
    efficiencyLabel: '7.6',
    routeTitle: 'Ruta Centro',
    routeSummary: 'Zona comercial · hora pico · semáforos densos',
    category: 'city',
    statusLabel: 'Media',
    timeLabel: '26 min',
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
        icon: 'zap',
        tone: 'warning',
      },
      {
        title: 'Tramo contenido',
        subtitle: 'Recuperaste estabilidad en el segundo segmento.',
        icon: 'sparkles',
        tone: 'accent',
      },
      {
        title: 'Cierre correcto',
        subtitle: 'Parada final sin exceso de ralentí.',
        icon: 'route',
        tone: 'success',
      },
    ],
    startedAt: Timestamp.fromDate(new Date('2026-06-18T18:40:00-05:00')),
  },
  {
    id: 'north',
    title: 'Ruta norte',
    subtitle: '28 may · 5:22 PM',
    period: '28 may',
    route: 'Ruta norte',
    summary: '49 min · 41.0 km · 6.1 L',
    score: 95,
    scoreDescription: 'Trayecto largo con conducción muy constante.',
    distanceLabel: '41.0 km',
    durationLabel: '49m',
    durationMinutes: 49,
    fuelLabel: '6.1 L',
    fuelLiters: 6.1,
    efficiencyLabel: '8.9',
    routeTitle: 'Ruta norte',
    routeSummary: 'Corredor norte · flujo estable · ahorro alto',
    category: 'north',
    statusLabel: 'Norte',
    timeLabel: '49 min',
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
        icon: 'sparkles',
        tone: 'accent',
      },
      {
        title: 'Crucero estable',
        subtitle: 'Poca variación de velocidad durante el corredor.',
        icon: 'gauge',
        tone: 'success',
      },
      {
        title: 'Llegada limpia',
        subtitle: 'Cierre sin frenadas agresivas en la salida norte.',
        icon: 'route',
        tone: 'success',
      },
    ],
    startedAt: Timestamp.fromDate(new Date('2026-05-28T17:22:00-05:00')),
  },
  {
    id: 'home',
    title: 'Casa',
    subtitle: '26 may · 7:15 PM',
    period: '26 may',
    route: 'Casa',
    summary: '21 min · 12.8 km · 0.9 L',
    score: 86,
    scoreDescription: 'Ruta corta con un par de frenadas urbanas.',
    distanceLabel: '12.8 km',
    durationLabel: '21m',
    durationMinutes: 21,
    fuelLabel: '0.9 L',
    fuelLiters: 0.9,
    efficiencyLabel: '7.2',
    routeTitle: 'Ruta Casa',
    routeSummary: 'Barrio residencial · pendientes suaves · poco tráfico',
    category: 'home',
    statusLabel: 'Óptima',
    timeLabel: '21 min',
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
        icon: 'sparkles',
        tone: 'accent',
      },
      {
        title: 'Pendiente corta',
        subtitle: 'Hubo un tramo con mayor demanda de combustible.',
        icon: 'zap',
        tone: 'warning',
      },
      {
        title: 'Entrada estable',
        subtitle: 'Llegada final sin exceso de consumo.',
        icon: 'route',
        tone: 'success',
      },
    ],
    startedAt: Timestamp.fromDate(new Date('2026-05-26T19:15:00-05:00')),
  },
];

function capitalize(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function inferDisplayName(email: string) {
  const localPart = email.split('@')[0] ?? 'autosense';
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map(capitalize)
    .join(' ');
}

function providerForUser(user: User): 'password' | 'google.com' {
  return user.providerData[0]?.providerId === 'google.com'
    ? 'google.com'
    : 'password';
}

function buildDefaultUserDoc(user: User): Omit<AutoSenseUserDoc, 'createdAt' | 'updatedAt'> {
  const email = user.email ?? '';
  const displayName = user.displayName?.trim() || inferDisplayName(email);

  return {
    uid: user.uid,
    email,
    displayName,
    photoURL: user.photoURL ?? null,
    provider: providerForUser(user),
    phoneNumber: '+507 6000 0000',
    roleLabel: 'Propietario',
    vehicle: {
      name: 'Honda Civic 1.5T',
      summary: 'Honda Civic 1.5T · Activo',
      statusLabel: 'Activo',
      fuelTankLiters: 58,
    },
    dashboard: {
      fuelPercent: 48,
      remainingRangeKm: 318,
      drivingStyle: 'Suave',
      drivingStyleNote: 'Aceleraciones estables',
      efficiencyScore: 82,
      efficiencyNote: 'Buen ahorro esta semana',
      currentTripDistanceKm: 28.4,
      currentTripConsumptionLabel: 'Promedio 8.1 L/100 km',
      savingsTip:
        'Mantén velocidades constantes; podrías ahorrar 9% de gasolina en rutas urbanas.',
      savingsPercent: 9,
    },
    settings: {
      speedUnit: 'km/h',
      temperatureUnit: '°C',
      consumptionUnit: 'L/100 km',
      alertsMode: 'Activado',
      dataMode: 'Cloud sync',
      privacyMode: 'Rutas privadas',
    },
    efficiency: {
      score: 82,
      accelerationPercent: 87,
      brakingPercent: 91,
      idleMinutes: 14,
      economyValue: 8.6,
    },
    alerts: DEFAULT_ALERTS,
    realtime: {
      isConnected: false,
      statusLabel: 'Listo para emparejar',
      signalLabel: 'Señal estable',
      deviceLabel: 'OBD2 Bluetooth',
      lastConnectedAt: null,
    },
  };
}

function buildMissingUserFields(user: User, current?: Partial<AutoSenseUserDoc>) {
  const defaults = buildDefaultUserDoc(user);
  const patch: Partial<AutoSenseUserDoc> = {
    uid: user.uid,
    email: user.email ?? current?.email ?? '',
    displayName:
      user.displayName?.trim() || current?.displayName || defaults.displayName,
    photoURL: user.photoURL ?? current?.photoURL ?? null,
    provider: providerForUser(user),
  };

  if (!current?.phoneNumber) {
    patch.phoneNumber = defaults.phoneNumber;
  }

  if (!current?.roleLabel) {
    patch.roleLabel = defaults.roleLabel;
  }

  if (!current?.vehicle) {
    patch.vehicle = defaults.vehicle;
  }

  if (!current?.dashboard) {
    patch.dashboard = defaults.dashboard;
  }

  if (!current?.settings) {
    patch.settings = defaults.settings;
  }

  if (!current?.efficiency) {
    patch.efficiency = defaults.efficiency;
  }

  if (!current?.alerts) {
    patch.alerts = defaults.alerts;
  }

  if (!current?.realtime) {
    patch.realtime = defaults.realtime;
  }

  return patch;
}

export async function ensureUserData(user: User) {
  const userRef = doc(db, USERS_COLLECTION, user.uid);
  const userSnapshot = await getDoc(userRef);

  if (!userSnapshot.exists()) {
    await setDoc(userRef, {
      ...buildDefaultUserDoc(user),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(
      userRef,
      {
        ...buildMissingUserFields(user, userSnapshot.data() as Partial<AutoSenseUserDoc>),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  const tripsRef = collection(userRef, TRIPS_SUBCOLLECTION);
  const tripsSnapshot = await getDocs(query(tripsRef, limit(1)));

  if (!tripsSnapshot.empty) {
    return;
  }

  await Promise.all(
    DEFAULT_TRIPS.map((trip) => setDoc(doc(tripsRef, trip.id), trip)),
  );
}

export function subscribeToUser(
  userId: string,
  onValue: (value: AutoSenseUserDoc | null) => void,
) {
  return onSnapshot(doc(db, USERS_COLLECTION, userId), (snapshot) => {
    onValue(snapshot.exists() ? (snapshot.data() as AutoSenseUserDoc) : null);
  });
}

async function getUserSnapshotOnce(userId: string) {
  const snapshot = await getDoc(doc(db, USERS_COLLECTION, userId));
  return snapshot.exists() ? (snapshot.data() as AutoSenseUserDoc) : null;
}

export function subscribeToTrips(
  userId: string,
  onValue: (value: AutoSenseTripDoc[]) => void,
) {
  const tripsQuery = query(
    collection(db, USERS_COLLECTION, userId, TRIPS_SUBCOLLECTION),
    orderBy('startedAt', 'desc'),
  );

  return onSnapshot(tripsQuery, (snapshot) => {
    onValue(
      snapshot.docs.map((document) => ({
        id: document.id,
        ...(document.data() as Omit<AutoSenseTripDoc, 'id'>),
      })),
    );
  });
}

async function getTripsOnce(userId: string) {
  const tripsQuery = query(
    collection(db, USERS_COLLECTION, userId, TRIPS_SUBCOLLECTION),
    orderBy('startedAt', 'desc'),
  );
  const snapshot = await getDocs(tripsQuery);

  return snapshot.docs.map((document) => ({
    id: document.id,
    ...(document.data() as Omit<AutoSenseTripDoc, 'id'>),
  }));
}

export async function updateUserSettings(
  userId: string,
  settings: AutoSenseUserDoc['settings'],
) {
  await setDoc(
    doc(db, USERS_COLLECTION, userId),
    {
      settings,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function updateUserVehicle(
  userId: string,
  vehicle: AutoSenseUserDoc['vehicle'],
  realtime?: Partial<AutoSenseUserDoc['realtime']>,
) {
  await setDoc(
    doc(db, USERS_COLLECTION, userId),
    {
      vehicle,
      ...(realtime ? { realtime } : null),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function setRealtimeConnectionState(
  userId: string,
  isConnected: boolean,
) {
  await setDoc(
    doc(db, USERS_COLLECTION, userId),
    {
      realtime: {
        isConnected,
        statusLabel: isConnected ? 'Conectado y transmitiendo' : 'Listo para emparejar',
        signalLabel: isConnected ? 'Lectura en vivo' : 'Señal estable',
        deviceLabel: 'OBD2 Bluetooth',
        lastConnectedAt: isConnected ? serverTimestamp() : null,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function getInitials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'AS';
}

function resolveAlerts(
  alerts?: Partial<Record<AlertId, AutoSenseAlertSnapshot>> | null,
) {
  return { ...DEFAULT_ALERTS, ...alerts };
}

export function getAlertCount(
  alerts?: Partial<Record<AlertId, AutoSenseAlertSnapshot>> | null,
) {
  return Object.values(resolveAlerts(alerts)).filter((alert) => alert.value !== 'OK').length;
}

export function getPriorityAlert(
  alerts?: Partial<Record<AlertId, AutoSenseAlertSnapshot>> | null,
) {
  const resolvedAlerts = Object.values(resolveAlerts(alerts));

  return (
    resolvedAlerts.find((alert) => alert.tone === 'danger')
    ?? resolvedAlerts.find((alert) => alert.tone === 'warning')
    ?? resolvedAlerts[0]
  );
}

export function useUserSnapshot(
  userId?: string | null,
): {
  data: AutoSenseUserDoc | null;
  isLoading: boolean;
} {
  const [data, setData] = useState<AutoSenseUserDoc | null>(null);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    let unsubscribe: Unsubscribe | undefined;

    if (!userId) {
      return;
    }

    void getUserSnapshotOnce(userId)
      .then((nextData) => {
        if (!isActive) {
          return;
        }

        setData(nextData);
        setResolvedUserId(userId);
      })
      .catch(() => {
        if (!isActive) {
          return;
        }

        setResolvedUserId(userId);
      });

    unsubscribe = subscribeToUser(userId, (nextData) => {
      if (!isActive) {
        return;
      }

      setData(nextData);
      setResolvedUserId(userId);
    });

    return () => {
      isActive = false;
      unsubscribe?.();
    };
  }, [userId]);

  return {
    data: userId && resolvedUserId === userId ? data : null,
    isLoading: Boolean(userId) && resolvedUserId !== userId,
  };
}

export function useUserTrips(userId?: string | null) {
  const [trips, setTrips] = useState<AutoSenseTripDoc[]>([]);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      return;
    }

    let isActive = true;

    void getTripsOnce(userId)
      .then((nextTrips) => {
        if (!isActive) {
          return;
        }

        setTrips(nextTrips);
        setResolvedUserId(userId);
      })
      .catch(() => {
        if (!isActive) {
          return;
        }

        setResolvedUserId(userId);
      });

    const unsubscribe = subscribeToTrips(userId, (nextTrips) => {
      if (!isActive) {
        return;
      }

      setTrips(nextTrips);
      setResolvedUserId(userId);
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [userId]);

  return {
    trips: userId && resolvedUserId === userId ? trips : [],
    isLoading: Boolean(userId) && resolvedUserId !== userId,
  };
}

export function useTrip(userId: string | null | undefined, tripId: string) {
  const { trips, isLoading } = useUserTrips(userId);

  return useMemo(
    () => ({
      trip: trips.find((item) => item.id === tripId) ?? trips[0] ?? null,
      isLoading,
    }),
    [isLoading, tripId, trips],
  );
}

export function useMockObdTelemetry(isConnected: boolean) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isConnected) {
      return;
    }

    const timer = setInterval(() => {
      setTick((current) => current + 1);
    }, 1400);

    return () => clearInterval(timer);
  }, [isConnected]);

  return useMemo<MockObdTelemetry>(() => {
    const phase = (isConnected ? tick : 0) / 2.8;

    return {
      speed: Math.max(0, Math.round(88 + Math.sin(phase) * 11)),
      rpm: Math.max(850, Math.round(2350 + Math.cos(phase * 0.92) * 190)),
      engineTemp: Math.round(91 + Math.sin(phase * 0.45) * 2),
      fuelLiters: Number(Math.max(54.2, 58 - (isConnected ? tick : 0) * 0.04).toFixed(1)),
      engineLoad: Math.round(36 + Math.sin(phase * 1.2) * 5),
      voltage: Number((13.8 + Math.cos(phase * 0.55) * 0.2).toFixed(1)),
      throttle: Math.round(18 + Math.sin(phase * 0.85) * 6),
      intakeTemp: Math.round(24 + Math.cos(phase * 0.5) * 2),
    };
  }, [isConnected, tick]);
}
