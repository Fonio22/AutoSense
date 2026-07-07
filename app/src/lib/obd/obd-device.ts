import { decode, encode } from 'base-64';
import { PermissionsAndroid, Platform } from 'react-native';

import type {
  BleManager as BleManagerType,
  Device,
  Subscription,
} from 'react-native-ble-plx';

import type { MockObdTelemetry } from '@/lib/autosense-data';

import type { ProfileDownloadInfo, VehicleProfile } from './vehicle-profile';

export const AUTOSENSE_OBD_SERVICE_UUID = '6f2d0001-5f9b-4b56-9f51-8f7f4a3a1001';
export const AUTOSENSE_OBD_RX_UUID = '6f2d0002-5f9b-4b56-9f51-8f7f4a3a1001';
export const AUTOSENSE_OBD_TX_UUID = '6f2d0003-5f9b-4b56-9f51-8f7f4a3a1001';

type AnomalySeverity = NonNullable<MockObdTelemetry['anomaly']>['severity'];
type RouteType = NonNullable<MockObdTelemetry['routeType']>;
type RouteState = NonNullable<MockObdTelemetry['routeState']>;
type BlePlxModule = typeof import('react-native-ble-plx');
type FileSystemModule = typeof import('expo-file-system/legacy');

export type ObdDeviceInfo = {
  deviceId: string;
  firmwareVersion: string;
  hardwareVersion: string;
  profileId?: string;
  profileVersion?: string;
  freeHeap?: number;
  maxChunkBytes?: number;
  capabilities?: string[];
};

export type ObdActiveProfile = {
  profileId?: string;
  profileVersion?: string;
  sha256?: string;
};

export type ObdLogInfo = {
  ready: boolean;
  enabled: boolean;
  recordSize: number;
  recordsWritten: number;
  capacityRecords: number;
  lastSequence: number;
};

export type ObdLogExportResult = {
  recordSize: number;
  recordCount: number;
  firstSequence: number;
  lastSequence: number;
  sizeBytes: number;
  base64Data: string;
};

type ObdLogExportStart = {
  recordSize?: number;
  recordCount?: number;
  firstSequence?: number;
  lastSequence?: number;
  done?: boolean;
};

type ObdLogChunk = {
  recordSize?: number;
  recordCount?: number;
  firstSequence?: number;
  lastSequence?: number;
  sentRecords?: number;
  totalRecords?: number;
  done?: boolean;
  payload?: string;
};

type ObdResponse<T = unknown> = {
  id?: string;
  command?: string;
  ok?: boolean;
  error?: string;
  data?: T;
};

type PendingRequest = {
  reject: (error: Error) => void;
  resolve: (value: ObdResponse) => void;
  timeout: ReturnType<typeof setTimeout>;
};

let bleModule: BlePlxModule | null | undefined;
let fileSystemModule: FileSystemModule | null | undefined;
let manager: BleManagerType | null = null;
let activeConnection: ObdBleConnection | null = null;

function loadFileSystemModule() {
  if (fileSystemModule !== undefined) {
    return fileSystemModule;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    fileSystemModule = require('expo-file-system/legacy') as FileSystemModule;
  } catch {
    fileSystemModule = null;
  }

  return fileSystemModule;
}

function getLastDeviceIdPath(fileSystem: FileSystemModule) {
  return fileSystem.documentDirectory
    ? `${fileSystem.documentDirectory}autosense-last-obd-device-id.txt`
    : null;
}

function loadBleModule() {
  if (Platform.OS === 'web') {
    return null;
  }

  if (bleModule !== undefined) {
    return bleModule;
  }

  try {
    // Native module is unavailable in Expo Go. Keep import lazy so demo mode still opens.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    bleModule = require('react-native-ble-plx') as BlePlxModule;
  } catch {
    bleModule = null;
  }

  return bleModule;
}

function getBleManager() {
  const module = loadBleModule();
  if (!module) {
    throw new Error('BLE no disponible. Usa un development build, no Expo Go.');
  }

  manager ??= new module.BleManager();
  return manager;
}

async function requestBlePermissions() {
  if (Platform.OS !== 'android') {
    return;
  }

  const permissions = Number(Platform.Version) >= 31
    ? [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]
    : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

  const results = await PermissionsAndroid.requestMultiple(permissions);
  const denied = permissions.find((permission) => (
    results[permission] !== PermissionsAndroid.RESULTS.GRANTED
  ));
  if (denied) {
    throw new Error('Permisos Bluetooth requeridos para buscar AutoSense.');
  }
}

function decodeBase64Json<T>(value: string | null | undefined): T | null {
  if (!value) {
    return null;
  }

  return JSON.parse(decode(value)) as T;
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readLastAutoSenseDeviceId() {
  const fileSystem = loadFileSystemModule();
  if (!fileSystem) {
    return null;
  }

  const path = getLastDeviceIdPath(fileSystem);
  if (!path) {
    return null;
  }

  const info = await fileSystem.getInfoAsync(path).catch(() => null);
  if (!info?.exists) {
    return null;
  }

  const deviceId = await fileSystem.readAsStringAsync(path).catch(() => '');
  return deviceId.trim() || null;
}

async function saveLastAutoSenseDeviceId(deviceId: string) {
  const fileSystem = loadFileSystemModule();
  if (!fileSystem) {
    return;
  }

  const path = getLastDeviceIdPath(fileSystem);
  if (!path || !deviceId) {
    return;
  }

  await fileSystem.writeAsStringAsync(path, deviceId).catch((error) => {
    console.warn('[obd] last device id save failed', error);
  });
}

function isAutoSenseDevice(device: Device) {
  const name = `${device.name ?? ''} ${device.localName ?? ''}`.toLowerCase();
  const services = device.serviceUUIDs ?? [];
  return name.includes('autosense') || services.includes(AUTOSENSE_OBD_SERVICE_UUID);
}

export class ObdBleConnection {
  private pending = new Map<string, PendingRequest>();
  private telemetryListeners = new Set<(telemetry: MockObdTelemetry) => void>();
  private notificationSubscription: Subscription | null = null;
  private streamPollTimer: ReturnType<typeof setInterval> | null = null;
  private sequence = 0;

  constructor(
    private readonly managerRef: BleManagerType,
    private device: Device,
  ) {}

  get deviceId() {
    return this.device.id;
  }

  async connect() {
    const isConnected = await this.device.isConnected().catch(() => false);
    if (!isConnected) {
      this.device = await this.device.connect({
        requestMTU: 247,
        timeout: 10000,
      });
    } else if (Platform.OS === 'android') {
      this.device = await this.device.requestMTU(247).catch(() => this.device);
    }
    this.device = await this.device.discoverAllServicesAndCharacteristics();
    this.monitorNotifications();
    await wait(350);
    activeConnection = this;
    void saveLastAutoSenseDeviceId(this.device.id);
    return this;
  }

  async disconnect() {
    this.notificationSubscription?.remove();
    this.notificationSubscription = null;
    if (this.streamPollTimer) {
      clearInterval(this.streamPollTimer);
      this.streamPollTimer = null;
    }
    this.pending.forEach((pending) => {
      clearTimeout(pending.timeout);
      pending.reject(new Error('BLE disconnected.'));
    });
    this.pending.clear();
    if (activeConnection === this) {
      activeConnection = null;
    }

    await this.managerRef.cancelDeviceConnection(this.device.id).catch(() => undefined);
  }

  async getDeviceInfo() {
    const response = await this.request<ObdDeviceInfo>('GET_DEVICE_INFO');
    if (!response.data) {
      throw new Error('GET_DEVICE_INFO sin payload.');
    }
    return response.data;
  }

  async readVin() {
    const response = await this.request<{ vin?: string }>('READ_VIN', undefined, 12000);
    return response.data?.vin?.trim() || '';
  }

  async getSupportedPids() {
    const response = await this.request<{ pids?: string[] }>('GET_SUPPORTED_PIDS');
    return response.data?.pids ?? [];
  }

  async getActiveProfile() {
    const response = await this.request<ObdActiveProfile>('GET_ACTIVE_PROFILE');
    return response.data ?? {};
  }

  async getLogInfo() {
    const response = await this.request<ObdLogInfo>('GET_LOG_INFO');
    if (!response.data) {
      throw new Error('GET_LOG_INFO sin payload.');
    }
    return response.data;
  }

  async exportLogSince(afterSequence: number): Promise<ObdLogExportResult> {
    const start = await this.request<ObdLogExportStart>(
      'START_LOG_EXPORT',
      { afterSequence: Math.max(0, Math.floor(afterSequence)) },
      15000,
    );
    const startData = start.data ?? {};
    const expectedRecords = Math.max(0, Number(startData.recordCount ?? 0));
    const recordSize = Math.max(1, Number(startData.recordSize ?? 24));
    let base64Data = '';
    let receivedRecords = 0;
    let firstReceivedSequence = 0;
    let lastReceivedSequence = 0;
    let done = Boolean(startData.done) || expectedRecords === 0;
    let emptyChunks = 0;

    try {
      while (!done && receivedRecords < expectedRecords) {
        const chunk = await this.request<ObdLogChunk>(
          'GET_LOG_CHUNK',
          { maxRecords: 8 },
          15000,
        );
        const data = chunk.data ?? {};
        const count = Math.max(0, Number(data.recordCount ?? 0));
        if (data.payload) {
          base64Data += data.payload;
        }
        receivedRecords += count;
        if (count > 0) {
          const chunkFirst = Number(data.firstSequence ?? 0);
          const chunkLast = Number(data.lastSequence ?? 0);
          if (chunkFirst > 0 && (firstReceivedSequence === 0 || chunkFirst < firstReceivedSequence)) {
            firstReceivedSequence = chunkFirst;
          }
          if (chunkLast > lastReceivedSequence) {
            lastReceivedSequence = chunkLast;
          }
        }
        done = Boolean(data.done) || receivedRecords >= expectedRecords;

        if (count === 0 && !done && ++emptyChunks > 3) {
          throw new Error('OBD log export stalled.');
        }
      }
    } finally {
      await this.request('END_LOG_EXPORT').catch(() => undefined);
    }

    return {
      recordSize,
      recordCount: receivedRecords,
      firstSequence: firstReceivedSequence || Number(startData.firstSequence ?? 0),
      lastSequence: lastReceivedSequence || Number(startData.lastSequence ?? afterSequence),
      sizeBytes: receivedRecords * recordSize,
      base64Data,
    };
  }

  async applyProfile(profileText: string, profile: VehicleProfile, info: ProfileDownloadInfo) {
    const deviceInfo = await this.getDeviceInfo().catch(() => null);
    const maxChunkBytes = Math.max(64, Math.min(deviceInfo?.maxChunkBytes ?? 128, 192));

    await this.request('START_PROFILE_TRANSFER', {
      profileId: info.profileId,
      version: info.version,
      sha256: info.sha256,
      sizeBytes: info.sizeBytes,
      schemaVersion: info.schemaVersion,
    });

    for (let offset = 0; offset < profileText.length; offset += maxChunkBytes) {
      const chunk = profileText.slice(offset, offset + maxChunkBytes);
      await this.request('PROFILE_CHUNK', {
        offset,
        data: encode(chunk),
      });
    }

    await this.request('END_PROFILE_TRANSFER');
    await this.request('APPLY_PROFILE', {
      profileId: profile.profileId,
      version: profile.version,
    });
  }

  async startStream(listener: (telemetry: MockObdTelemetry) => void) {
    this.telemetryListeners.add(listener);
    await this.request('START_STREAM');
    this.startStreamPollingFallback();

    return () => {
      this.telemetryListeners.delete(listener);
      if (this.telemetryListeners.size === 0) {
        if (this.streamPollTimer) {
          clearInterval(this.streamPollTimer);
          this.streamPollTimer = null;
        }
        void this.request('STOP_STREAM').catch(() => undefined);
      }
    };
  }

  private monitorNotifications() {
    this.notificationSubscription?.remove();
    this.notificationSubscription = this.device.monitorCharacteristicForService(
      AUTOSENSE_OBD_SERVICE_UUID,
      AUTOSENSE_OBD_TX_UUID,
      (error, characteristic) => {
        if (error) {
          return;
        }

        this.handleIncomingValue(characteristic?.value, 'notify');
      },
    );
  }

  private handleIncomingValue(value: string | null | undefined, source: 'notify' | 'read') {
    let message: ObdResponse | null = null;
    try {
      message = decodeBase64Json<ObdResponse>(value);
    } catch (parseError) {
      // ponytail: BLE notify can arrive truncated; the read fallback below gets the full value.
      if (source === 'notify') {
        return;
      }
      console.error(`[obd] BLE ${source} parse failed`, parseError);
      return;
    }
    if (!message) {
      return;
    }
    if (message.command !== 'TELEMETRY') {
      console.log('[obd] rx', source, message.command, message.ok, message.error ?? '');
    }

    if (message.command === 'TELEMETRY' && message.data) {
      this.telemetryListeners.forEach((listener) => {
        listener(normalizeTelemetry(message.data as Partial<MockObdTelemetry>));
      });
      return;
    }

    const requestId = message.id;
    if (!requestId) {
      return;
    }

    const pending = this.pending.get(requestId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pending.delete(requestId);

    if (message.ok === false) {
      pending.reject(new Error(message.error ?? 'OBD command failed.'));
    } else {
      pending.resolve(message);
    }
  }

  private async readTxOnce() {
    const characteristic = await this.device.readCharacteristicForService(
      AUTOSENSE_OBD_SERVICE_UUID,
      AUTOSENSE_OBD_TX_UUID,
    );
    this.handleIncomingValue(characteristic.value, 'read');
  }

  private startStreamPollingFallback() {
    if (this.streamPollTimer) {
      return;
    }
    this.streamPollTimer = setInterval(() => {
      void this.readTxOnce().catch(() => undefined);
    }, 1100);
  }

  private async request<T = unknown>(command: string, data?: unknown, timeoutMs = 6000) {
    const id = `${Date.now()}-${this.sequence++}`;
    const payload = encode(JSON.stringify({ id, command, data }));
    if (command !== 'PROFILE_CHUNK') {
      console.log('[obd] tx', command);
    }
    const responsePromise = new Promise<ObdResponse<T>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${command} timeout.`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: resolve as (value: ObdResponse) => void,
        reject,
        timeout,
      });
    });

    await this.device.writeCharacteristicWithResponseForService(
      AUTOSENSE_OBD_SERVICE_UUID,
      AUTOSENSE_OBD_RX_UUID,
      payload,
    );
    [180, 500, 1200, 2500].forEach((delayMs) => {
      setTimeout(() => {
        if (this.pending.has(id)) {
          void this.readTxOnce().catch((readError) => {
            console.warn('[obd] tx read fallback failed', command, readError);
          });
        }
      }, delayMs);
    });

    return responsePromise;
  }
}

export async function connectToFirstAutoSenseDevice(timeoutMs = 10000) {
  const bleManager = getBleManager();
  await requestBlePermissions();

  if (Platform.OS === 'android' && await bleManager.state() !== 'PoweredOn') {
    await bleManager.enable();
  }

  const connectedDevices = await bleManager
    .connectedDevices([AUTOSENSE_OBD_SERVICE_UUID])
    .catch(() => []);
  const fallbackConnectedDevices = connectedDevices.length > 0
    ? connectedDevices
    : await bleManager.connectedDevices([]).catch(() => []);
  const connectedAutoSense = fallbackConnectedDevices.find(isAutoSenseDevice)
    ?? fallbackConnectedDevices[0];
  console.log('[obd] connected devices', fallbackConnectedDevices.length, connectedAutoSense?.id ?? '');
  if (connectedAutoSense) {
    return new ObdBleConnection(bleManager, connectedAutoSense).connect();
  }

  const lastDeviceId = await readLastAutoSenseDeviceId();
  if (lastDeviceId) {
    try {
      console.log('[obd] reconnecting last device', lastDeviceId);
      const device = await bleManager.connectToDevice(lastDeviceId, {
        requestMTU: 247,
        timeout: Math.min(4000, Math.max(1500, Math.round(timeoutMs * 0.35))),
      });
      return new ObdBleConnection(bleManager, device).connect();
    } catch (error) {
      console.warn('[obd] last device reconnect failed', error);
    }
  }

  return new Promise<ObdBleConnection>((resolve, reject) => {
    let completed = false;
    const timeout = setTimeout(() => {
      if (completed) {
        return;
      }
      completed = true;
      bleManager.stopDeviceScan();
      reject(new Error('No se encontró un ESP32 AutoSense por BLE.'));
    }, timeoutMs);

    bleManager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (completed) {
        return;
      }

      if (error) {
        completed = true;
        clearTimeout(timeout);
        bleManager.stopDeviceScan();
        reject(error);
        return;
      }

      if (!device || !isAutoSenseDevice(device)) {
        return;
      }

      completed = true;
      clearTimeout(timeout);
      bleManager.stopDeviceScan();
      void new ObdBleConnection(bleManager, device)
        .connect()
        .then(resolve)
        .catch(reject);
    });
  });
}

export function getActiveObdConnection() {
  return activeConnection;
}

function normalizeTelemetry(data: Partial<MockObdTelemetry>): MockObdTelemetry {
  const anomalySeverity = String(data.anomaly?.severity ?? 'NORMAL');
  const severity: AnomalySeverity = (
    anomalySeverity === 'WATCH'
    || anomalySeverity === 'WARNING'
    || anomalySeverity === 'CRITICAL'
  )
    ? anomalySeverity
    : 'NORMAL';
  const anomaly = data.anomaly && typeof data.anomaly === 'object'
    ? {
        score: Math.max(0, Math.min(100, Number(data.anomaly.score ?? 0))),
        severity,
        areaMask: Number(data.anomaly.areaMask ?? 0),
        baselineReady: Boolean(data.anomaly.baselineReady),
        modelReady: Boolean(data.anomaly.modelReady),
      }
    : null;
  const rawRouteType = String(data.routeType ?? 'unknown');
  const routeType: RouteType = (
    rawRouteType === 'city'
    || rawRouteType === 'highway'
  )
    ? rawRouteType
    : 'unknown';
  const rawRouteState = String(data.routeState ?? 'unknown');
  const routeState: RouteState = (
    rawRouteState === 'city'
    || rawRouteState === 'highway_candidate'
    || rawRouteState === 'highway'
  )
    ? rawRouteState
    : 'unknown';

  return {
    speed: Math.max(0, Math.round(Number(data.speed ?? 0))),
    rpm: Math.max(0, Math.round(Number(data.rpm ?? 0))),
    engineTemp: Math.round(Number(data.engineTemp ?? 0)),
    fuelLiters: Number(data.fuelLiters ?? 0),
    engineLoad: Math.round(Number(data.engineLoad ?? 0)),
    voltage: Number(data.voltage ?? 0),
    throttle: Math.round(Number(data.throttle ?? 0)),
    intakeTemp: Math.round(Number(data.intakeTemp ?? 0)),
    validMask: Number(data.validMask ?? 0),
    routeType,
    routeState,
    routeConfidence: Math.max(0, Math.min(100, Math.round(Number(data.routeConfidence ?? 0)))),
    routeScore: Math.max(-100, Math.min(100, Math.round(Number(data.routeScore ?? 0)))),
    routeReason: String(data.routeReason ?? ''),
    anomaly,
  };
}
