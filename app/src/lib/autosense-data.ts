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
  where,
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
  validMask?: number;
  anomaly?: {
    score: number;
    severity: 'NORMAL' | 'WATCH' | 'WARNING' | 'CRITICAL';
    areaMask?: number;
    baselineReady?: boolean;
    modelReady?: boolean;
  } | null;
};

export type ObdTelemetry = MockObdTelemetry;

const USERS_COLLECTION = 'users';
const TRIPS_SUBCOLLECTION = 'trips';
const DEVICES_COLLECTION = 'devices';

const DEFAULT_ALERTS: Record<AlertId, AutoSenseAlertSnapshot> = {
  battery: {
    title: 'Batería',
    subtitle: 'Sin lectura fuera de rango',
    value: 'OK',
    tone: 'success',
  },
  brakes: {
    title: 'Frenos',
    subtitle: 'Sin sensor OBD2 activo',
    value: 'OK',
    tone: 'success',
  },
  oil: {
    title: 'Temperatura',
    subtitle: 'Motor dentro de rango',
    value: 'OK',
    tone: 'success',
  },
  tire: {
    title: 'Llantas',
    subtitle: 'Sin sensor OBD2 activo',
    value: 'OK',
    tone: 'success',
  },
  efficiency: {
    title: 'Consumo',
    subtitle: 'Lectura normal',
    value: 'OK',
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

const LEGACY_SEEDED_TRIP_IDS = new Set(DEFAULT_TRIPS.map((trip) => trip.id));

export function isLegacySeededDashboard(
  dashboard?: AutoSenseUserDoc['dashboard'] | null,
) {
  return Boolean(dashboard)
    && dashboard?.fuelPercent === 48
    && dashboard.remainingRangeKm === 318
    && dashboard.drivingStyle === 'Suave'
    && dashboard.efficiencyScore === 82
    && dashboard.currentTripDistanceKm === 28.4
    && dashboard.currentTripConsumptionLabel === 'Promedio 8.1 L/100 km';
}

export function isLegacySeededEfficiency(
  efficiency?: AutoSenseUserDoc['efficiency'] | null,
) {
  return Boolean(efficiency)
    && efficiency?.score === 82
    && efficiency.accelerationPercent === 87
    && efficiency.brakingPercent === 91
    && efficiency.idleMinutes === 14
    && efficiency.economyValue === 8.6;
}

export function isLegacySeededVehicle(
  vehicle?: AutoSenseUserDoc['vehicle'] | null,
) {
  return vehicle?.name === 'Honda Civic 1.5T';
}

function isLegacySeededTrip(trip: AutoSenseTripDoc) {
  if (!LEGACY_SEEDED_TRIP_IDS.has(trip.id)) {
    return false;
  }

  const seededTrip = DEFAULT_TRIPS.find((item) => item.id === trip.id);
  return trip.title === seededTrip?.title && trip.summary === seededTrip?.summary;
}

function isImpossibleActiveTrip(trip: AutoSenseTripDoc) {
  if (trip.statusLabel !== 'En curso') {
    return false;
  }

  if (trip.durationMinutes > 240) {
    return true;
  }

  const distanceKm = trip.distanceKm ?? Number.parseFloat(trip.distanceLabel);
  const hours = Math.max(1, trip.durationMinutes) / 60;

  return Number.isFinite(distanceKm) && distanceKm / hours > 220;
}

function filterLegacySeededTrips(trips: AutoSenseTripDoc[]) {
  return trips.filter((trip) => !isLegacySeededTrip(trip) && !isImpossibleActiveTrip(trip));
}

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
      name: 'AutoSense',
      summary: 'AutoSense · Sin registrar',
      statusLabel: 'Sin registrar',
      fuelTankLiters: 58,
    },
    dashboard: {
      fuelPercent: 0,
      remainingRangeKm: 0,
      drivingStyle: 'Sin datos',
      drivingStyleNote: 'Conecta AutoSense para leer tu manejo',
      efficiencyScore: 0,
      efficiencyNote: 'Esperando telemetría real',
      currentTripDistanceKm: 0,
      currentTripConsumptionLabel: 'Sin datos',
      savingsTip:
        'Conecta AutoSense para calcular sugerencias reales de ahorro.',
      savingsPercent: 0,
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
      score: 0,
      accelerationPercent: 0,
      brakingPercent: 0,
      idleMinutes: 0,
      economyValue: 0,
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

  // Trips are created from real OBD2 sessions. Keep old seeded trips readable
  // through Firestore, but do not create new demo history for fresh users.
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
      filterLegacySeededTrips(snapshot.docs.map((document) => ({
        id: document.id,
        ...(document.data() as Omit<AutoSenseTripDoc, 'id'>),
      }))),
    );
  });
}

async function getTripsOnce(userId: string) {
  const tripsQuery = query(
    collection(db, USERS_COLLECTION, userId, TRIPS_SUBCOLLECTION),
    orderBy('startedAt', 'desc'),
  );
  const snapshot = await getDocs(tripsQuery);

  return filterLegacySeededTrips(snapshot.docs.map((document) => ({
    id: document.id,
    ...(document.data() as Omit<AutoSenseTripDoc, 'id'>),
  })));
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
  options: Partial<AutoSenseUserDoc['realtime']> = {},
) {
  await setDoc(
    doc(db, USERS_COLLECTION, userId),
    {
      realtime: {
        isConnected,
        statusLabel: options.statusLabel
          ?? (isConnected ? 'Conectado y transmitiendo' : 'Listo para emparejar'),
        signalLabel: options.signalLabel
          ?? (isConnected ? 'Lectura en vivo' : 'Señal estable'),
        deviceLabel: options.deviceLabel ?? 'OBD2 Bluetooth',
        lastConnectedAt: isConnected ? serverTimestamp() : null,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isUsefulTelemetry(telemetry: ObdTelemetry) {
  return telemetry.speed > 0
    || telemetry.rpm > 0
    || telemetry.engineTemp > 0
    || telemetry.fuelLiters > 0
    || telemetry.engineLoad > 0
    || telemetry.voltage > 0
    || telemetry.throttle > 0
    || telemetry.intakeTemp > 0;
}

function drivingStyleFromTelemetry(telemetry: ObdTelemetry) {
  if (telemetry.anomaly?.severity === 'WARNING' || telemetry.anomaly?.severity === 'CRITICAL') {
    return {
      label: 'Revisar',
      note: `IA local ${Math.round(telemetry.anomaly.score)}% de anomalía`,
    };
  }

  if (telemetry.engineLoad >= 75 || telemetry.rpm >= 3800) {
    return {
      label: 'Exigente',
      note: 'Carga alta detectada por OBD2',
    };
  }

  if (telemetry.engineLoad <= 45 && telemetry.rpm <= 2800) {
    return {
      label: 'Suave',
      note: 'Carga baja y RPM estable',
    };
  }

  return {
    label: 'Estable',
    note: 'Respuesta normal del motor',
  };
}

function efficiencyFromTelemetry(telemetry: ObdTelemetry) {
  const effectiveThrottle = telemetry.engineLoad > 20 ? telemetry.throttle : Math.min(telemetry.throttle, 25);
  const anomalyPenalty = telemetry.anomaly?.severity === 'CRITICAL'
    ? 24
    : telemetry.anomaly?.severity === 'WARNING'
      ? 14
      : 0;
  const rpmPenalty = telemetry.rpm > 3800 ? 18 : telemetry.rpm > 3000 ? 8 : 0;
  const loadPenalty = Math.round(clampNumber(telemetry.engineLoad - 35, 0, 45) * 0.7);
  const throttlePenalty = Math.round(clampNumber(effectiveThrottle - 22, 0, 45) * 0.45);
  const score = Math.round(clampNumber(96 - anomalyPenalty - rpmPenalty - loadPenalty - throttlePenalty, 0, 100));

  return {
    score,
    note: score >= 82
      ? 'Lectura eficiente del AutoSense'
      : score >= 65
        ? 'Consumo moderado en esta sesión'
        : 'Carga alta en esta sesión',
  };
}

function efficiencyDetailsFromTelemetry(telemetry: ObdTelemetry, score: number, consumption: number) {
  const effectiveThrottle = telemetry.engineLoad > 20 ? telemetry.throttle : Math.min(telemetry.throttle, 25);
  const accelerationPercent = Math.round(clampNumber(
    100 - Math.max(0, effectiveThrottle - 18) * 1.1 - Math.max(0, telemetry.rpm - 2600) * 0.012,
    0,
    100,
  ));
  const brakingPercent = Math.round(clampNumber(
    telemetry.speed > 0 ? 92 - Math.max(0, telemetry.engineLoad - 62) * 0.35 : 88,
    0,
    100,
  ));
  const idleMinutes = telemetry.speed <= 2 && telemetry.rpm >= 650 ? 1 : 0;

  return {
    score,
    accelerationPercent,
    brakingPercent,
    idleMinutes,
    economyValue: Number(consumption.toFixed(1)),
  };
}

function alertSnapshot(
  title: string,
  subtitle: string,
  value: string,
  tone: AlertTone,
): AutoSenseAlertSnapshot {
  return { title, subtitle, value, tone };
}

function alertsFromTelemetry(
  telemetry: ObdTelemetry,
  efficiencyScore: number,
): Record<AlertId, AutoSenseAlertSnapshot> {
  const anomalyIsAlert = telemetry.anomaly?.baselineReady
    && (telemetry.anomaly.severity === 'WARNING' || telemetry.anomaly.severity === 'CRITICAL');
  const voltage = telemetry.voltage;
  const battery = voltage > 0 && voltage < 11.8
    ? alertSnapshot('Batería', `Voltaje ${voltage.toFixed(1)}V por debajo del rango`, 'Crítica', 'danger')
    : voltage > 0 && voltage < 12.3
      ? alertSnapshot('Batería', `Voltaje ${voltage.toFixed(1)}V requiere revisión`, 'Media', 'warning')
      : alertSnapshot(
        'Batería',
        voltage > 0 ? `Voltaje ${voltage.toFixed(1)}V estable` : 'Voltaje no disponible',
        'OK',
        'success',
      );
  const temperature = telemetry.engineTemp;
  const oil = temperature > 110
    ? alertSnapshot('Temperatura', `Motor ${temperature}°C en rango crítico`, 'Crítica', 'danger')
    : temperature > 100
      ? alertSnapshot('Temperatura', `Motor ${temperature}°C por encima del rango normal`, 'Media', 'warning')
      : alertSnapshot(
        'Temperatura',
        temperature > 0 ? `Motor ${temperature}°C dentro de rango` : 'Temperatura no disponible',
        'OK',
        'success',
      );
  const efficiency = anomalyIsAlert
    ? alertSnapshot(
      'Anomalía OBD2',
      `IA local ${Math.round(telemetry.anomaly?.score ?? 0)}% · posible área a revisar`,
      telemetry.anomaly?.severity === 'CRITICAL' ? 'Crítica' : 'Media',
      telemetry.anomaly?.severity === 'CRITICAL' ? 'danger' : 'warning',
    )
    : telemetry.engineLoad >= 85 || telemetry.rpm >= 4200
      ? alertSnapshot('Consumo', 'Carga alta sostenida detectada por OBD2', 'Revisar', 'warning')
      : alertSnapshot(
        'Consumo',
        `Score real ${efficiencyScore}% desde RPM/carga/acelerador`,
        'OK',
        'success',
      );

  return {
    battery,
    brakes: alertSnapshot('Frenos', 'Sin sensor OBD2 activo', 'OK', 'success'),
    oil,
    tire: alertSnapshot('Llantas', 'Sin sensor OBD2 activo', 'OK', 'success'),
    efficiency,
  };
}

export async function updateDashboardFromTelemetry(
  userId: string,
  telemetry: ObdTelemetry,
  currentProfile?: AutoSenseUserDoc | null,
) {
  if (!userId || !isUsefulTelemetry(telemetry)) {
    return;
  }

  const currentDashboard = isLegacySeededDashboard(currentProfile?.dashboard)
    ? null
    : currentProfile?.dashboard;
  const tankLiters = clampNumber(currentProfile?.vehicle?.fuelTankLiters ?? 58, 1, 150);
  const hasFuelReading = telemetry.fuelLiters > 0;
  const fuelLiters = hasFuelReading
    ? clampNumber(telemetry.fuelLiters, 0, tankLiters)
    : clampNumber(((currentDashboard?.fuelPercent ?? 0) / 100) * tankLiters, 0, tankLiters);
  const fuelPercent = hasFuelReading
    ? Math.round(clampNumber((fuelLiters / tankLiters) * 100, 0, 100))
    : currentDashboard?.fuelPercent ?? 0;
  const estimatedConsumption = clampNumber(
    6.2 + telemetry.engineLoad * 0.045 + telemetry.throttle * 0.035,
    4.5,
    18,
  );
  const remainingRangeKm = hasFuelReading
    ? Math.round(fuelLiters * (100 / estimatedConsumption))
    : currentDashboard?.remainingRangeKm ?? 0;
  const style = drivingStyleFromTelemetry(telemetry);
  const efficiency = efficiencyFromTelemetry(telemetry);
  const distanceKm = clampNumber(
    (currentDashboard?.currentTripDistanceKm ?? 0) + (telemetry.speed > 0 ? telemetry.speed / 360 : 0),
    0,
    2000,
  );
  const savingsPercent = Math.round(clampNumber((100 - efficiency.score) / 4, 0, 25));
  const savingsTip = efficiency.score >= 82
    ? 'Mantén esta carga de motor y RPM para conservar el consumo bajo.'
    : 'Reduce aceleraciones fuertes para mejorar el consumo en esta ruta.';
  const efficiencyDetails = efficiencyDetailsFromTelemetry(
    telemetry,
    efficiency.score,
    estimatedConsumption,
  );

  await setDoc(
    doc(db, USERS_COLLECTION, userId),
    {
      dashboard: {
        fuelPercent,
        remainingRangeKm: clampNumber(remainingRangeKm, 0, 2000),
        drivingStyle: style.label,
        drivingStyleNote: style.note,
        efficiencyScore: efficiency.score,
        efficiencyNote: efficiency.note,
        currentTripDistanceKm: Number(distanceKm.toFixed(1)),
        currentTripConsumptionLabel: `Promedio ${estimatedConsumption.toFixed(1)} L/100 km`,
        savingsTip,
        savingsPercent,
      },
      efficiency: efficiencyDetails,
      alerts: alertsFromTelemetry(telemetry, efficiency.score),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function getInitials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'AS';
}

export function resolveAlerts(
  alerts?: Partial<Record<AlertId, AutoSenseAlertSnapshot>> | null,
) {
  if (
    alerts?.battery?.value === 'Crítica'
    && alerts.brakes?.value === 'Media'
    && alerts.oil?.value === 'Media'
    && alerts.tire?.value === 'Baja'
    && alerts.efficiency?.value === 'Ver'
  ) {
    return DEFAULT_ALERTS;
  }

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
  const resolvedAlerts = Object.values(resolveAlerts(alerts))
    .filter((alert) => alert.value !== 'OK');

  return (
    resolvedAlerts.find((alert) => alert.tone === 'danger')
    ?? resolvedAlerts.find((alert) => alert.tone === 'warning')
    ?? resolvedAlerts[0]
    ?? null
  );
}

if (__DEV__) {
  const simulatorSample: ObdTelemetry = {
    speed: 123,
    rpm: 2193,
    engineTemp: 33,
    fuelLiters: 40.2,
    engineLoad: 4,
    voltage: 0,
    throttle: 63,
    intakeTemp: -37,
  };

  if (drivingStyleFromTelemetry(simulatorSample).label === 'Exigente') {
    throw new Error('dashboard telemetry sanity check failed: low-load sample marked Exigente');
  }

  if (getAlertCount(alertsFromTelemetry(simulatorSample, 90)) !== 0) {
    throw new Error('dashboard telemetry sanity check failed: low-load sample created alerts');
  }
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

export function useHasRegisteredDevice(userId?: string | null) {
  const [hasRegisteredDevice, setHasRegisteredDevice] = useState(false);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const devicesQuery = query(
      collection(db, DEVICES_COLLECTION),
      where('ownerId', '==', userId),
      limit(1),
    );

    const unsubscribe = onSnapshot(
      devicesQuery,
      (snapshot) => {
        setHasRegisteredDevice(!snapshot.empty);
        setResolvedUserId(userId);
      },
      () => {
        setHasRegisteredDevice(false);
        setResolvedUserId(userId);
      },
    );

    return unsubscribe;
  }, [userId]);

  return {
    hasRegisteredDevice: Boolean(userId) && resolvedUserId === userId && hasRegisteredDevice,
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
