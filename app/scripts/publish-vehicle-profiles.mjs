import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const projectId = 'autosense-1178d';
const bucket = 'autosense-1178d.firebasestorage.app';
const repoRoot = path.resolve(import.meta.dirname, '../..');
const profilesDir = path.join(repoRoot, 'vehicle-profiles');
const cliConfigPath = path.join(homedir(), '.config/configstore/firebase-tools.json');

const profileDocs = {
  generic_obd2: {
    make: 'GENERIC',
    model: 'OBD2',
    yearStart: 1996,
    yearEnd: 2099,
    engine: '',
    notes: 'Perfil OBD2 estándar para soporte parcial.',
  },
  obd2_simulator: {
    make: 'OBD2',
    model: 'SIMULATOR',
    yearStart: 1996,
    yearEnd: 2099,
    engine: '',
    notes: 'Perfil para simulador físico OBD2.',
  },
  vw_passat_2016: {
    make: 'VOLKSWAGEN',
    model: 'PASSAT',
    yearStart: 2016,
    yearEnd: 2016,
    engine: '',
    notes: 'PIDs estándar verificados en capturas locales; UDS read-only desde firmware existente.',
  },
};

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function fieldValue(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  return { stringValue: String(value) };
}

async function checkedFetch(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 300)}`);
  }
  return response;
}

async function main() {
  const [{ tokens }, metadataText] = await Promise.all([
    readFile(cliConfigPath, 'utf8').then(JSON.parse),
    readFile(path.join(profilesDir, 'metadata.json'), 'utf8'),
  ]);
  const accessToken = tokens?.access_token;
  if (!accessToken) {
    throw new Error('No Firebase CLI access token found. Run `firebase login`.');
  }

  const metadata = JSON.parse(metadataText);
  for (const [profileId, meta] of Object.entries(metadata)) {
    const profileText = await readFile(path.join(profilesDir, `${profileId}.json`), 'utf8');
    const actualHash = sha256(profileText);
    if (actualHash !== meta.sha256) {
      throw new Error(`${profileId} hash mismatch`);
    }

    const storageUrl = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o`);
    storageUrl.searchParams.set('uploadType', 'media');
    storageUrl.searchParams.set('name', meta.storagePath);
    await checkedFetch(storageUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: profileText,
    });

    const doc = {
      ...profileDocs[profileId],
      supportLevel: meta.supportLevel,
      latestVersion: meta.version,
      storagePath: meta.storagePath,
      hash: meta.sha256,
      sha256: meta.sha256,
      schemaVersion: meta.schemaVersion,
      sizeBytes: meta.sizeBytes,
      updatedAt: new Date().toISOString(),
    };
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/vehicleProfiles/${profileId}`;
    await checkedFetch(firestoreUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: Object.fromEntries(
          Object.entries(doc).map(([key, value]) => [key, fieldValue(value)]),
        ),
      }),
    });

    console.log(`published ${profileId} -> ${meta.storagePath}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
