export type ProfileMetadata = {
  profileId: string;
  version: string;
  schemaVersion: number;
  supportLevel: 'full' | 'partial' | 'simulator' | 'unsupported';
  storagePath: string;
  sizeBytes: number;
  sha256: string;
};

export const PROFILE_METADATA: Record<string, ProfileMetadata> = {
  generic_obd2: {
    profileId: 'generic_obd2',
    version: '1.0.0',
    schemaVersion: 1,
    supportLevel: 'partial',
    storagePath: 'vehicle-profiles/generic_obd2/1.0.0/profile.json',
    sizeBytes: 3174,
    sha256: 'b5312324b2bd8825948817b6e17ee003f1db692bfd10675c89c21a9ca389e93d',
  },
  obd2_simulator: {
    profileId: 'obd2_simulator',
    version: '1.0.1',
    schemaVersion: 1,
    supportLevel: 'simulator',
    storagePath: 'vehicle-profiles/obd2_simulator/1.0.1/profile.json',
    sizeBytes: 3191,
    sha256: 'c1136bf3d639744c024a6c7516741974af7de84be9fea0b503dfc19f97074078',
  },
  vw_passat_2016: {
    profileId: 'vw_passat_2016',
    version: '1.0.0',
    schemaVersion: 1,
    supportLevel: 'full',
    storagePath: 'vehicle-profiles/vw_passat_2016/1.0.0/profile.json',
    sizeBytes: 7170,
    sha256: 'fe9b515031d36f1b3d68d96ac46f70b19f4a0e4b68ce5532297964edec85cd39',
  },
};
