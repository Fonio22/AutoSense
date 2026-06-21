import genericObd2 from './local-profiles/generic_obd2.json';
import obd2Simulator from './local-profiles/obd2_simulator.json';
import vwPassat2016 from './local-profiles/vw_passat_2016.json';
import { sha256Text, type ProfileDownloadInfo, type VehicleProfile } from './vehicle-profile';

const LOCAL_PROFILES = {
  generic_obd2: genericObd2,
  obd2_simulator: obd2Simulator,
  vw_passat_2016: vwPassat2016,
} as const;

export type LocalProfileId = keyof typeof LOCAL_PROFILES;

export function isLocalProfileId(profileId: string): profileId is LocalProfileId {
  return profileId in LOCAL_PROFILES;
}

export async function loadLocalVehicleProfile(profileId: LocalProfileId) {
  const profile = LOCAL_PROFILES[profileId] as VehicleProfile;
  const text = JSON.stringify(profile);
  const sha256 = await sha256Text(text);
  const info: ProfileDownloadInfo = {
    profileId: profile.profileId,
    version: profile.version,
    schemaVersion: profile.schemaVersion,
    supportLevel: profile.supportLevel,
    storagePath: `local://${profile.profileId}/${profile.version}/profile.json`,
    sha256,
    sizeBytes: text.length,
  };

  return { profile, text, info };
}
