import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const profilesDir = path.join(repoRoot, 'vehicle-profiles');
const allowedFormulaIds = new Set([
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
const allowedObdModes = new Set(['01', '09']);
const blockedObdModes = new Set(['04', '08']);
const blockedUds = new Set(['0x11', '0x14', '0x27', '0x28', '0x2E', '0x2F', '0x31', '0x3D', '0x85']);

function isHexByte(value) {
  return typeof value === 'string' && /^[0-9A-F]{2}$/u.test(value);
}

function isHexId(value) {
  return typeof value === 'string' && /^0x[0-9A-F]+$/u.test(value);
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function validateSignal(signal, profileId) {
  assert.equal(typeof signal.key, 'string', `${profileId}: signal.key`);
  assert.equal(typeof signal.label, 'string', `${profileId}: signal.label`);
  assert.ok(allowedObdModes.has(signal.mode), `${profileId}:${signal.key} unsupported mode ${signal.mode}`);
  assert.ok(!blockedObdModes.has(signal.mode), `${profileId}:${signal.key} blocked mode ${signal.mode}`);
  assert.ok(isHexByte(signal.pid), `${profileId}:${signal.key} invalid pid`);
  assert.ok(allowedFormulaIds.has(signal.formulaId), `${profileId}:${signal.key} formulaId not allowlisted`);
  assert.equal(typeof signal.pollMs, 'number', `${profileId}:${signal.key} pollMs`);
  assert.ok(signal.pollMs >= 100 && signal.pollMs <= 60000, `${profileId}:${signal.key} pollMs range`);
  assert.equal(typeof signal.enabledByDefault, 'boolean', `${profileId}:${signal.key} enabledByDefault`);
}

function validateProfile(profile, raw) {
  assert.equal(profile.schemaVersion, 1, `${profile.profileId}: schemaVersion`);
  assert.match(profile.profileId, /^[a-z0-9_]+$/u);
  assert.match(profile.version, /^\d+\.\d+\.\d+$/u);
  assert.ok(Buffer.byteLength(raw, 'utf8') <= 16 * 1024, `${profile.profileId}: profile exceeds 16 KiB`);
  assert.equal(profile.protocol.bus, 'CAN', `${profile.profileId}: only CAN is supported`);
  assert.ok(isHexId(profile.protocol.requestId), `${profile.profileId}: requestId`);
  for (const id of profile.protocol.responseIds) {
    assert.ok(isHexId(id), `${profile.profileId}: responseId ${id}`);
  }
  assert.ok(Array.isArray(profile.signals) && profile.signals.length > 0, `${profile.profileId}: signals`);
  profile.signals.forEach((signal) => validateSignal(signal, profile.profileId));

  const extended = profile.extendedReadOnly;
  if (!extended) {
    return;
  }

  for (const service of extended.udsServices ?? []) {
    assert.ok(!blockedUds.has(service.toUpperCase()), `${profile.profileId}: blocked UDS ${service}`);
    assert.ok(service === '0x22' || service === '0x19', `${profile.profileId}: non-read-only UDS ${service}`);
  }
}

const files = (await readdir(profilesDir))
  .filter((file) => file.endsWith('.json') && file !== 'metadata.json')
  .sort();

const metadata = {};
for (const file of files) {
  const raw = await readFile(path.join(profilesDir, file), 'utf8');
  const profile = JSON.parse(raw);
  validateProfile(profile, raw);
  metadata[profile.profileId] = {
    profileId: profile.profileId,
    version: profile.version,
    schemaVersion: profile.schemaVersion,
    supportLevel: profile.supportLevel,
    storagePath: `vehicle-profiles/${profile.profileId}/${profile.version}/profile.json`,
    sizeBytes: Buffer.byteLength(raw, 'utf8'),
    sha256: sha256(raw),
  };
}

await writeFile(
  path.join(profilesDir, 'metadata.json'),
  `${JSON.stringify(metadata, null, 2)}\n`,
);

console.log(JSON.stringify({
  profiles: Object.keys(metadata),
  count: Object.keys(metadata).length,
}, null, 2));
