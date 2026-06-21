import * as FileSystem from 'expo-file-system/legacy';

import {
  parseAndValidateVehicleProfile,
  type ProfileDownloadInfo,
  type VehicleProfile,
} from './vehicle-profile';

const PROFILE_DIR = `${FileSystem.documentDirectory ?? ''}vehicle-profiles/`;
const ACTIVE_PROFILE_PATH = `${PROFILE_DIR}active-profile.json`;
const ACTIVE_PROFILE_META_PATH = `${PROFILE_DIR}active-profile-meta.json`;

async function ensureProfileDir() {
  const info = await FileSystem.getInfoAsync(PROFILE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PROFILE_DIR, { intermediates: true });
  }
}

export async function saveActiveVehicleProfile(profileText: string, info: ProfileDownloadInfo) {
  await ensureProfileDir();
  await FileSystem.writeAsStringAsync(ACTIVE_PROFILE_PATH, profileText);
  await FileSystem.writeAsStringAsync(ACTIVE_PROFILE_META_PATH, JSON.stringify(info));
}

export async function loadActiveVehicleProfile(): Promise<{
  profile: VehicleProfile;
  info: ProfileDownloadInfo;
  text: string;
} | null> {
  const profileInfo = await FileSystem.getInfoAsync(ACTIVE_PROFILE_PATH);
  const metaInfo = await FileSystem.getInfoAsync(ACTIVE_PROFILE_META_PATH);

  if (!profileInfo.exists || !metaInfo.exists) {
    return null;
  }

  const [text, metaText] = await Promise.all([
    FileSystem.readAsStringAsync(ACTIVE_PROFILE_PATH),
    FileSystem.readAsStringAsync(ACTIVE_PROFILE_META_PATH),
  ]);
  const info = JSON.parse(metaText) as ProfileDownloadInfo;
  const profile = await parseAndValidateVehicleProfile(text, info);

  return { profile, info, text };
}
