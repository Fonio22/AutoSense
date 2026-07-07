import * as FileSystem from 'expo-file-system/legacy';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ref, uploadString } from 'firebase/storage';

import { db, storage } from '@/lib/firebase-client';

import type { ObdBleConnection, ObdDeviceInfo } from './obd-device';

type SyncObdLogOptions = {
  cloudSync?: boolean;
  connection: ObdBleConnection;
  deviceInfo?: ObdDeviceInfo | null;
  userId: string;
};

type ObdLogSyncResult = {
  deviceId: string;
  firstSequence: number;
  lastSequence: number;
  localPath: string;
  recordCount: number;
  sizeBytes: number;
  storagePath?: string;
};

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 96) || 'device';
}

function requireDocumentDirectory() {
  if (!FileSystem.documentDirectory) {
    throw new Error('FileSystem documentDirectory unavailable.');
  }

  return FileSystem.documentDirectory;
}

async function ensureDirectory(path: string) {
  const info = await FileSystem.getInfoAsync(path).catch(() => null);
  if (!info?.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

function localDeviceDir(deviceId: string) {
  return `${requireDocumentDirectory()}autosense-obdlogs/${safeSegment(deviceId)}/`;
}

function localCursorPath(deviceId: string) {
  return `${localDeviceDir(deviceId)}cursor.json`;
}

async function readLocalCursor(deviceId: string) {
  const path = localCursorPath(deviceId);
  const info = await FileSystem.getInfoAsync(path).catch(() => null);
  if (!info?.exists) {
    return 0;
  }

  const raw = await FileSystem.readAsStringAsync(path).catch(() => '');
  const parsed = raw ? JSON.parse(raw) as { lastSyncedSequence?: number } : {};
  return Math.max(0, Number(parsed.lastSyncedSequence ?? 0));
}

async function writeLocalCursor(deviceId: string, lastSyncedSequence: number) {
  const directory = localDeviceDir(deviceId);
  await ensureDirectory(directory);
  await FileSystem.writeAsStringAsync(
    localCursorPath(deviceId),
    JSON.stringify({ lastSyncedSequence, updatedAt: new Date().toISOString() }),
  );
}

async function readCloudCursor(userId: string, deviceKey: string) {
  const snapshot = await getDoc(doc(db, 'users', userId, 'obdLogSync', deviceKey));
  return Math.max(0, Number(snapshot.data()?.lastSyncedSequence ?? 0));
}

export async function syncObdLogHistory({
  cloudSync = true,
  connection,
  deviceInfo,
  userId,
}: SyncObdLogOptions): Promise<ObdLogSyncResult | null> {
  const deviceId = deviceInfo?.deviceId || connection.deviceId;
  const deviceKey = safeSegment(deviceId);
  const logInfo = await connection.getLogInfo();
  if (!logInfo.ready || logInfo.lastSequence <= 0) {
    return null;
  }

  const localCursor = await readLocalCursor(deviceId);
  const cloudCursor = cloudSync ? await readCloudCursor(userId, deviceKey).catch(() => 0) : 0;
  const afterSequence = Math.max(localCursor, cloudCursor);
  if (logInfo.lastSequence <= afterSequence) {
    return null;
  }

  const exported = await connection.exportLogSince(afterSequence);
  if (exported.recordCount === 0 || !exported.base64Data) {
    return null;
  }

  const directory = localDeviceDir(deviceId);
  await ensureDirectory(directory);
  const fileName = `${exported.firstSequence}-${exported.lastSequence}.bin`;
  const localPath = `${directory}${fileName}`;
  await FileSystem.writeAsStringAsync(localPath, exported.base64Data, {
    encoding: FileSystem.EncodingType.Base64,
  });

  let storagePath: string | undefined;
  const exportId = `${deviceKey}_${exported.firstSequence}_${exported.lastSequence}`;
  if (cloudSync) {
    storagePath = `users/${userId}/obdlogs/${deviceKey}/${fileName}`;
    await uploadString(
      ref(storage, storagePath),
      exported.base64Data,
      'base64',
      {
        contentType: 'application/octet-stream',
        customMetadata: {
          deviceId,
          firstSequence: String(exported.firstSequence),
          lastSequence: String(exported.lastSequence),
        },
      },
    );

    await setDoc(doc(db, 'users', userId, 'obdLogExports', exportId), {
      deviceId,
      firstSequence: exported.firstSequence,
      lastSequence: exported.lastSequence,
      recordCount: exported.recordCount,
      recordSize: exported.recordSize,
      sizeBytes: exported.sizeBytes,
      source: 'ble_obdlog_v1',
      storagePath,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'users', userId, 'obdLogSync', deviceKey), {
      deviceId,
      lastExportId: exportId,
      lastSyncedSequence: exported.lastSequence,
      storagePath,
      updatedAt: serverTimestamp(),
    });
  }

  await writeLocalCursor(deviceId, exported.lastSequence);

  return {
    deviceId,
    firstSequence: exported.firstSequence,
    lastSequence: exported.lastSequence,
    localPath,
    recordCount: exported.recordCount,
    sizeBytes: exported.sizeBytes,
    storagePath,
  };
}
