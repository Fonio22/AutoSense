import { createHash } from 'node:crypto';

import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';

import { PROFILE_METADATA, type ProfileMetadata } from './profile-metadata.js';

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });
initializeApp();

const db = getFirestore();

type DecodedVin = {
  vin: string;
  year: number | null;
  make: string;
  model: string;
  trim: string;
  engine: string;
  fuelType: string;
};

type ResolvedVehicle = DecodedVin & {
  vehicleId: string;
  simulatorMode?: boolean;
};

type SupportStatus = 'full' | 'partial' | 'unsupported';

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function cleanString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeVin(value: unknown) {
  const vin = cleanString(value).toUpperCase();
  if (!VIN_RE.test(vin)) {
    throw new HttpsError('invalid-argument', 'VIN inválido.');
  }
  return vin;
}

function requireAuth(uid: string | undefined) {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }
  return uid;
}

function normalizedUpper(value: unknown) {
  return cleanString(value).toUpperCase();
}

export function normalizeDecodedVin(vin: string, raw: Record<string, unknown>): DecodedVin {
  const yearValue = Number(cleanString(raw.ModelYear));
  return {
    vin,
    year: Number.isFinite(yearValue) && yearValue > 0 ? yearValue : null,
    make: normalizedUpper(raw.Make),
    model: normalizedUpper(raw.Model),
    trim: cleanString(raw.Trim),
    engine: cleanString(raw.EngineModel) || cleanString(raw.EngineConfiguration),
    fuelType: cleanString(raw.FuelTypePrimary),
  };
}

function vehicleDocIdForVin(vin: string) {
  return sha256(vin).slice(0, 24);
}

async function fetchDecodedVin(vin: string): Promise<DecodedVin> {
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new HttpsError('unavailable', `NHTSA vPIC HTTP ${response.status}`);
  }

  const body = (await response.json()) as { Results?: Array<Record<string, unknown>> };
  const first = body.Results?.[0];
  if (!first) {
    throw new HttpsError('not-found', 'NHTSA vPIC no devolvió resultados.');
  }

  return normalizeDecodedVin(vin, first);
}

async function decodeVinWithCache(vin: string) {
  const cacheId = sha256(vin);
  const cacheRef = db.collection('vinDecodeCache').doc(cacheId);
  const cached = await cacheRef.get();

  if (cached.exists) {
    return {
      decodedVin: cached.data()?.decodedVin as DecodedVin,
      cacheHit: true,
    };
  }

  const decodedVin = await fetchDecodedVin(vin);
  await cacheRef.set({
    vinHash: cacheId,
    decodedVin,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    source: 'nhtsa_vpic',
  });

  return { decodedVin, cacheHit: false };
}

export function resolveProfile(decodedVin: DecodedVin, simulatorMode = false) {
  if (simulatorMode) {
    return {
      profileId: 'obd2_simulator',
      supportStatus: 'partial' as SupportStatus,
    };
  }

  if (
    decodedVin.year === 2016
    && decodedVin.make === 'VOLKSWAGEN'
    && decodedVin.model.includes('PASSAT')
  ) {
    return {
      profileId: 'vw_passat_2016',
      supportStatus: 'full' as SupportStatus,
    };
  }

  return {
    profileId: 'generic_obd2',
    supportStatus: 'partial' as SupportStatus,
  };
}

async function metadataOrThrow(profileId: string, version?: string): Promise<ProfileMetadata> {
  const firestoreMetadata = await db.collection('vehicleProfiles').doc(profileId).get();
  const firestoreData = firestoreMetadata.exists ? firestoreMetadata.data() : null;
  const firestoreVersion = cleanString(firestoreData?.latestVersion ?? firestoreData?.version);
  const firestoreHash = cleanString(firestoreData?.sha256 ?? firestoreData?.hash);
  const metadata = firestoreData && firestoreVersion && firestoreHash
    ? {
        profileId,
        version: firestoreVersion,
        schemaVersion: Number(firestoreData.schemaVersion ?? 1),
        supportLevel: cleanString(firestoreData.supportLevel) as ProfileMetadata['supportLevel'],
        storagePath: cleanString(firestoreData.storagePath),
        sizeBytes: Number(firestoreData.sizeBytes ?? 0),
        sha256: firestoreHash,
      }
    : PROFILE_METADATA[profileId];

  if (!metadata || (version && metadata.version !== version)) {
    throw new HttpsError('not-found', 'Profile not found.');
  }
  if (!metadata.storagePath || !metadata.sha256 || !metadata.sizeBytes) {
    throw new HttpsError('failed-precondition', 'Profile metadata is incomplete.');
  }
  return metadata;
}

function compactProfileMetadata(metadata: ProfileMetadata) {
  return {
    profileId: metadata.profileId,
    version: metadata.version,
    schemaVersion: metadata.schemaVersion,
    supportLevel: metadata.supportLevel,
    storagePath: metadata.storagePath,
    sha256: metadata.sha256,
    sizeBytes: metadata.sizeBytes,
  };
}

async function upsertVehicle(uid: string, vehicle: ResolvedVehicle, profileId: string, supportStatus: SupportStatus) {
  const vehicleRef = db.collection('users').doc(uid).collection('vehicles').doc(vehicle.vehicleId);
  await vehicleRef.set(
    {
      vin: vehicle.vin,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      trim: vehicle.trim,
      engine: vehicle.engine,
      fuelType: vehicle.fuelType,
      detectedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      profileId,
      supportStatus,
      simulatorMode: vehicle.simulatorMode === true,
    },
    { merge: true },
  );
}

export const decodeVin = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  const vin = normalizeVin((request.data as { vin?: unknown })?.vin);
  return decodeVinWithCache(vin);
});

export const resolveVehicleProfile = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const data = (request.data ?? {}) as {
    vin?: unknown;
    decodedVin?: Partial<DecodedVin>;
    simulatorMode?: boolean;
  };

  let decodedVin: DecodedVin;
  let cacheHit = false;

  if (data.simulatorMode === true) {
    decodedVin = {
      vin: 'SIMULATOR',
      year: null,
      make: 'OBD2',
      model: 'SIMULATOR',
      trim: '',
      engine: '',
      fuelType: '',
    };
  } else if (data.decodedVin?.vin) {
    const vin = normalizeVin(data.decodedVin.vin);
    decodedVin = {
      vin,
      year: typeof data.decodedVin.year === 'number' ? data.decodedVin.year : null,
      make: normalizedUpper(data.decodedVin.make),
      model: normalizedUpper(data.decodedVin.model),
      trim: cleanString(data.decodedVin.trim),
      engine: cleanString(data.decodedVin.engine),
      fuelType: cleanString(data.decodedVin.fuelType),
    };
  } else {
    const vin = normalizeVin(data.vin);
    const result = await decodeVinWithCache(vin);
    decodedVin = result.decodedVin;
    cacheHit = result.cacheHit;
  }

  const { profileId, supportStatus } = resolveProfile(decodedVin, data.simulatorMode === true);
  const profileMetadata = await metadataOrThrow(profileId);
  const vehicle: ResolvedVehicle = {
    ...decodedVin,
    vehicleId: data.simulatorMode === true ? 'simulator' : vehicleDocIdForVin(decodedVin.vin),
    simulatorMode: data.simulatorMode === true,
  };

  await upsertVehicle(uid, vehicle, profileId, supportStatus);

  return {
    vehicle,
    profileId,
    profileVersion: profileMetadata.version,
    supportStatus,
    profile: compactProfileMetadata(profileMetadata),
    cacheHit,
  };
});

export const getProfileDownloadInfo = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  const data = (request.data ?? {}) as { profileId?: unknown; version?: unknown };
  const profileId = cleanString(data.profileId);
  if (!profileId) {
    throw new HttpsError('invalid-argument', 'profileId is required.');
  }

  const metadata = await metadataOrThrow(profileId, cleanString(data.version) || undefined);
  return compactProfileMetadata(metadata);
});

export const registerProfileApplication = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const data = (request.data ?? {}) as {
    deviceId?: unknown;
    vehicleId?: unknown;
    profileId?: unknown;
    profileVersion?: unknown;
    result?: unknown;
    supportedPids?: unknown;
    activeSensors?: unknown;
  };

  const deviceId = cleanString(data.deviceId);
  const vehicleId = cleanString(data.vehicleId);
  const profileId = cleanString(data.profileId);
  const profileVersion = cleanString(data.profileVersion);
  const result = cleanString(data.result);

  if (!deviceId || !vehicleId || !profileId || !profileVersion || !result) {
    throw new HttpsError('invalid-argument', 'deviceId, vehicleId, profileId, profileVersion and result are required.');
  }

  await metadataOrThrow(profileId, profileVersion);

  const applicationRef = db.collection('profileApplications').doc();
  const supportedPids = Array.isArray(data.supportedPids) ? data.supportedPids.slice(0, 256) : [];
  const activeSensors = Array.isArray(data.activeSensors) ? data.activeSensors.slice(0, 64) : [];

  await db.runTransaction(async (transaction) => {
    transaction.set(applicationRef, {
      userId: uid,
      deviceId,
      vehicleId,
      profileId,
      profileVersion,
      appliedAt: FieldValue.serverTimestamp(),
      result,
      supportedPids,
      activeSensors,
    });

    transaction.set(
      db.collection('devices').doc(deviceId),
      {
        ownerId: uid,
        activeProfileId: profileId,
        activeProfileVersion: profileVersion,
        lastSeenAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    transaction.set(
      db.collection('users').doc(uid).collection('vehicles').doc(vehicleId),
      {
        profileId,
        supportedPids,
        activeSensors,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  return {
    applicationId: applicationRef.id,
    result: 'registered',
  };
});
