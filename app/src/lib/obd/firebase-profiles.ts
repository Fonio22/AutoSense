import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref } from 'firebase/storage';

import { functions, storage } from '@/lib/firebase-client';

import {
  isLocalProfileId,
  loadLocalVehicleProfile,
} from './local-profile-fallback';
import { saveActiveVehicleProfile } from './profile-cache';
import {
  activeSignalKeys,
  parseAndValidateVehicleProfile,
  type ProfileDownloadInfo,
  type VehicleProfile,
} from './vehicle-profile';

export type DecodedVin = {
  vin: string;
  year: number | null;
  make: string;
  model: string;
  trim: string;
  engine: string;
  fuelType: string;
};

export type ResolvedVehicleProfile = {
  vehicle: DecodedVin & {
    vehicleId: string;
    simulatorMode?: boolean;
  };
  profileId: string;
  profileVersion: string;
  supportStatus: 'full' | 'partial' | 'unsupported';
  profile: ProfileDownloadInfo;
  cacheHit: boolean;
};

export type ProfileApplicationResult = {
  applicationId: string;
  result: string;
};

const resolveVehicleProfileCallable = httpsCallable<
  { vin?: string; simulatorMode?: boolean; decodedVin?: Partial<DecodedVin> },
  ResolvedVehicleProfile
>(functions, 'resolveVehicleProfile');

const getProfileDownloadInfoCallable = httpsCallable<
  { profileId: string; version?: string },
  ProfileDownloadInfo
>(functions, 'getProfileDownloadInfo');

const registerProfileApplicationCallable = httpsCallable<
  {
    deviceId: string;
    vehicleId: string;
    profileId: string;
    profileVersion: string;
    result: string;
    supportedPids: string[];
    activeSensors: string[];
  },
  ProfileApplicationResult
>(functions, 'registerProfileApplication');

export async function resolveVehicleProfile(input: {
  vin?: string;
  simulatorMode?: boolean;
  decodedVin?: Partial<DecodedVin>;
}) {
  const result = await resolveVehicleProfileCallable(input);
  return result.data;
}

export async function getProfileDownloadInfo(profileId: string, version?: string) {
  try {
    const result = await getProfileDownloadInfoCallable({ profileId, version });
    return result.data;
  } catch (error) {
    if (!isLocalProfileId(profileId)) {
      throw error;
    }

    const local = await loadLocalVehicleProfile(profileId);
    if (version && local.info.version !== version) {
      throw error;
    }
    return local.info;
  }
}

export async function downloadVehicleProfile(info: ProfileDownloadInfo) {
  if (info.storagePath.startsWith('local://') && isLocalProfileId(info.profileId)) {
    const local = await loadLocalVehicleProfile(info.profileId);
    const profile = await parseAndValidateVehicleProfile(local.text, local.info);
    await saveActiveVehicleProfile(local.text, local.info);

    return { profile, text: local.text, info: local.info };
  }

  const url = await getDownloadURL(ref(storage, info.storagePath));
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Profile download failed: HTTP ${response.status}`);
  }

  const text = await response.text();
  const profile = await parseAndValidateVehicleProfile(text, info);
  await saveActiveVehicleProfile(text, info);

  return { profile, text, info };
}

export async function registerProfileApplication(input: {
  deviceId: string;
  vehicleId: string;
  profile: VehicleProfile;
  info: ProfileDownloadInfo;
  result: string;
  supportedPids?: string[];
}) {
  const response = await registerProfileApplicationCallable({
    deviceId: input.deviceId,
    vehicleId: input.vehicleId,
    profileId: input.profile.profileId,
    profileVersion: input.info.version,
    result: input.result,
    supportedPids: input.supportedPids ?? [],
    activeSensors: activeSignalKeys(input.profile),
  });

  return response.data;
}
