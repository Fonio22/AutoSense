import * as Crypto from 'expo-crypto';

export type VehicleSupportLevel = 'full' | 'partial' | 'simulator' | 'unsupported';

export type VehicleProfileSignal = {
  key: string;
  label: string;
  mode: string;
  pid: string;
  unit: string;
  formula: string;
  formulaId: string;
  pollMs: number;
  required?: boolean;
  source?: string;
  enabledByDefault?: boolean;
};

export type VehicleProfile = {
  schemaVersion: number;
  profileId: string;
  version: string;
  minFirmwareVersion?: string;
  supportLevel: VehicleSupportLevel;
  vehicleMatch?: Record<string, unknown>;
  protocol: {
    bus: string;
    requestId?: string;
    responseIds?: string[];
    useIsoTp?: boolean;
    timeoutMs?: number;
    retry?: number;
  };
  discovery?: {
    mode01SupportPids?: string[];
    mode09Pids?: string[];
  };
  signals: VehicleProfileSignal[];
  extendedReadOnly?: {
    udsServices?: string[];
    udsModules?: Record<string, unknown>[];
  };
  trackingRules?: Record<string, unknown>;
};

export type ProfileDownloadInfo = {
  profileId: string;
  version: string;
  schemaVersion: number;
  supportLevel: VehicleSupportLevel;
  storagePath: string;
  sha256: string;
  sizeBytes: number;
};

const MAX_PROFILE_BYTES = 16 * 1024;
const SAFE_OBD_MODES = new Set(['01', '09']);
const BLOCKED_OBD_MODES = new Set(['04', '08']);
const SAFE_UDS_SERVICES = new Set(['0X19', '0X22']);
const BLOCKED_UDS_SERVICES = new Set([
  '0X11',
  '0X14',
  '0X27',
  '0X28',
  '0X2E',
  '0X2F',
  '0X31',
  '0X3D',
  '0X85',
]);
const FORMULA_IDS = new Set([
  'be16',
  'be16_div_4',
  'be16_div_100',
  'be16_div_1000',
  'be16_mul_0_05',
  'identity_a',
  'pct_a_255',
  'spark_adv_a_half_minus_64',
  'temp_a_minus_40',
  'trim_a_128',
]);

function assertProfile(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeHex(value: string) {
  return value.trim().toUpperCase().replace(/^0X/, '');
}

function profileSizeBytes(text: string) {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

export async function sha256Text(text: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
}

export function validateVehicleProfile(profile: VehicleProfile, text?: string, info?: ProfileDownloadInfo) {
  if (text) {
    assertProfile(profileSizeBytes(text) <= MAX_PROFILE_BYTES, 'Profile exceeds 16 KB.');
  }

  assertProfile(profile.schemaVersion === 1, 'Unsupported profile schemaVersion.');
  assertProfile(/^[a-z0-9_][a-z0-9_-]{1,63}$/.test(profile.profileId), 'Invalid profileId.');
  assertProfile(/^\d+\.\d+\.\d+$/.test(profile.version), 'Invalid profile version.');
  assertProfile(profile.protocol?.bus === 'CAN', 'Only CAN profiles are supported.');
  assertProfile(Array.isArray(profile.signals) && profile.signals.length > 0, 'Profile has no signals.');

  if (info) {
    assertProfile(profile.profileId === info.profileId, 'Downloaded profileId mismatch.');
    assertProfile(profile.version === info.version, 'Downloaded profile version mismatch.');
    assertProfile(profile.schemaVersion === info.schemaVersion, 'Downloaded schema mismatch.');
  }

  for (const signal of profile.signals) {
    const mode = normalizeHex(signal.mode);
    assertProfile(!BLOCKED_OBD_MODES.has(mode), `Blocked OBD mode in profile: ${signal.mode}`);
    assertProfile(SAFE_OBD_MODES.has(mode), `Non-read-only OBD mode in profile: ${signal.mode}`);
    assertProfile(/^[0-9A-F]{2}$/.test(normalizeHex(signal.pid)), `Invalid PID for ${signal.key}.`);
    assertProfile(FORMULA_IDS.has(signal.formulaId), `Formula not allowlisted: ${signal.formulaId}`);
    assertProfile(signal.pollMs >= 100 && signal.pollMs <= 60000, `Invalid pollMs for ${signal.key}.`);
  }

  for (const service of profile.extendedReadOnly?.udsServices ?? []) {
    const normalized = `0X${normalizeHex(service)}`;
    assertProfile(!BLOCKED_UDS_SERVICES.has(normalized), `Blocked UDS service in profile: ${service}`);
    assertProfile(SAFE_UDS_SERVICES.has(normalized), `UDS service is not read-only allowlisted: ${service}`);
  }

  return profile;
}

export async function parseAndValidateVehicleProfile(text: string, info?: ProfileDownloadInfo) {
  const profile = JSON.parse(text) as VehicleProfile;
  validateVehicleProfile(profile, text, info);

  if (info) {
    const actualHash = await sha256Text(text);
    assertProfile(actualHash === info.sha256, 'Downloaded profile hash mismatch.');
  }

  return profile;
}

export function activeSignalKeys(profile: VehicleProfile) {
  return profile.signals
    .filter((signal) => signal.enabledByDefault !== false)
    .map((signal) => signal.key);
}
