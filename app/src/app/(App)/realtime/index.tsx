import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Button } from 'heroui-native';
import {
  Bluetooth,
  CarFront,
  CheckCircle2,
  Cpu,
  Gauge,
  Radio,
  RefreshCcw,
} from 'lucide-react-native';
import {
  Image,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useSession } from '@/components/providers/session-provider';
import { AppScreen, PENCIL } from '@/components/pencil-ui';
import {
  setRealtimeConnectionState,
  updateUserVehicle,
  type AutoSenseUserDoc,
} from '@/lib/autosense-data';
import {
  downloadVehicleProfile,
  getProfileDownloadInfo,
  registerProfileApplication,
  resolveVehicleProfile,
  type DecodedVin,
} from '@/lib/obd/firebase-profiles';
import {
  connectToFirstAutoSenseDevice,
  getActiveObdConnection,
  type ObdBleConnection,
  type ObdDeviceInfo,
} from '@/lib/obd/obd-device';

type ManualProfile = {
  id: 'generic_obd2' | 'obd2_simulator' | 'vw_passat_2016';
  title: string;
  subtitle: string;
  badge: string;
};

const MANUAL_PROFILES: ManualProfile[] = [
  {
    id: 'generic_obd2',
    title: 'Generic OBD2',
    subtitle: 'PIDs estándar con soporte parcial.',
    badge: 'Parcial',
  },
  {
    id: 'obd2_simulator',
    title: 'OBD2 Simulator',
    subtitle: 'Para simulador físico conectado al AutoSense.',
    badge: 'Físico',
  },
  {
    id: 'vw_passat_2016',
    title: 'Volkswagen Passat 2016',
    subtitle: 'Perfil verificado para Passat B8/2016.',
    badge: 'Completo',
  },
];

const AUTO_SCAN_TIMEOUT_MS = 10000;
const heroCarSource = require('../../../../assets/images/home-car-hero.png');

type FlowState =
  | 'connecting_ble'
  | 'reading_vin'
  | 'applying_profile'
  | 'manual_profile_required'
  | 'connection_failed';

function isBusyState(state: FlowState) {
  return state === 'connecting_ble'
    || state === 'reading_vin'
    || state === 'applying_profile';
}

function isManualProfileId(value: string | undefined): value is ManualProfile['id'] {
  return MANUAL_PROFILES.some((profile) => profile.id === value);
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function vehicleForProfile(
  profileId: ManualProfile['id'],
  currentVehicle?: AutoSenseUserDoc['vehicle'] | null,
  decodedVehicle?: Partial<DecodedVin>,
): AutoSenseUserDoc['vehicle'] {
  const tankLiters = currentVehicle?.fuelTankLiters ?? 58;

  if (decodedVehicle?.make || decodedVehicle?.model) {
    const name = [
      decodedVehicle.year,
      titleCase(decodedVehicle.make ?? ''),
      titleCase(decodedVehicle.model ?? ''),
    ].filter(Boolean).join(' ');
    return {
      name,
      summary: `${name} · Perfil verificado`,
      statusLabel: profileId === 'vw_passat_2016' ? 'Perfil verificado' : 'Soporte parcial',
      fuelTankLiters: tankLiters,
    };
  }

  if (profileId === 'vw_passat_2016') {
    return {
      name: 'Volkswagen Passat 2016',
      summary: 'Volkswagen Passat 2016 · Perfil verificado',
      statusLabel: 'Perfil verificado',
      fuelTankLiters: tankLiters,
    };
  }

  if (profileId === 'obd2_simulator') {
    return {
      name: 'OBD2 Simulator',
      summary: 'Simulador físico · AutoSense ESP32',
      statusLabel: 'Simulador físico',
      fuelTankLiters: tankLiters,
    };
  }

  return {
    name: 'Generic OBD2',
    summary: 'Generic OBD2 · Soporte parcial',
    statusLabel: 'Soporte parcial',
    fuelTankLiters: tankLiters,
  };
}

export default function RealtimePairScreen() {
  const { firebaseUser, profile } = useSession();
  const connectionRef = useRef<ObdBleConnection | null>(null);
  const deviceInfoRef = useRef<ObdDeviceInfo | null>(null);
  const autoConnectInFlight = useRef(false);
  const [flowState, setFlowState] = useState<FlowState>(() => (
    getActiveObdConnection() ? 'applying_profile' : 'connecting_ble'
  ));
  const [manualVehicleId, setManualVehicleId] = useState('manual_no_vin');
  const [statusMessage, setStatusMessage] = useState(() => (
    getActiveObdConnection()
      ? 'AutoSense conectado. Abriendo datos en vivo...'
      : 'Buscando AutoSense ESP32 por Bluetooth...'
  ));
  const isBusy = isBusyState(flowState);
  const showProfiles = flowState === 'manual_profile_required';
  const screenTitle = flowState === 'connection_failed'
    ? 'AutoSense no encontrado'
    : showProfiles
      ? 'Elige tu perfil'
      : flowState === 'reading_vin'
        ? 'Leyendo VIN'
        : flowState === 'applying_profile'
          ? 'Aplicando perfil'
          : 'Conectando por Bluetooth';
  const busyStep = flowState === 'applying_profile' ? 2 : flowState === 'reading_vin' ? 1 : 0;

  async function enterLiveWithActiveProfile(profileId: ManualProfile['id']) {
    if (!firebaseUser?.uid) {
      return;
    }

    setFlowState('applying_profile');
    setStatusMessage(`Perfil activo detectado: ${profileId}. Iniciando datos en vivo...`);
    await setRealtimeConnectionState(firebaseUser.uid, true, {
      statusLabel: profileId === 'obd2_simulator'
        ? 'Simulador físico conectado'
        : 'Conectado y transmitiendo',
      signalLabel: 'Perfil activo',
      deviceLabel: `AutoSense ESP32 · ${profileId}`,
    });
    await updateUserVehicle(
      firebaseUser.uid,
      vehicleForProfile(profileId, profile?.vehicle),
    ).catch((error) => {
      console.warn('[obd] vehicle snapshot update failed', error);
    });
    router.replace('/realtime/live');
  }

  async function applyConnectedProfile(
    profileId: ManualProfile['id'],
    vehicleId: string,
    decodedVehicle?: Partial<DecodedVin>,
  ) {
    const connection = connectionRef.current;
    if (!connection) {
      throw new Error('ESP32 no conectado.');
    }

    setFlowState('applying_profile');
    setStatusMessage(`Aplicando perfil ${profileId} al AutoSense...`);
    const deviceInfo = deviceInfoRef.current ?? await connection.getDeviceInfo();
    deviceInfoRef.current = deviceInfo;
    const info = await getProfileDownloadInfo(profileId);
    const bundle = await downloadVehicleProfile(info);
    const activeProfile = await connection.getActiveProfile().catch(() => null);

    if (
      activeProfile?.profileId !== bundle.profile.profileId
      || activeProfile.profileVersion !== bundle.profile.version
    ) {
      await connection.applyProfile(bundle.text, bundle.profile, bundle.info);
    }
    const supportedPids = await connection.getSupportedPids().catch(() => []);
    await registerProfileApplication({
      deviceId: deviceInfo.deviceId || connection.deviceId,
      vehicleId,
      profile: bundle.profile,
      info: bundle.info,
      result: 'applied',
      supportedPids,
    }).catch((error) => {
      console.warn('[obd] profile application registration failed', error);
    });

    await setRealtimeConnectionState(firebaseUser!.uid, true, {
      statusLabel: profileId === 'obd2_simulator'
        ? 'Simulador físico conectado'
        : 'Conectado y transmitiendo',
      signalLabel: 'Perfil aplicado',
      deviceLabel: `AutoSense ESP32 · ${profileId}`,
    });
    await updateUserVehicle(
      firebaseUser!.uid,
      vehicleForProfile(profileId, profile?.vehicle, decodedVehicle),
    ).catch((error) => {
      console.warn('[obd] vehicle snapshot update failed', error);
    });
    router.push('/realtime/live');
  }

  async function handleAutoConnect() {
    if (!firebaseUser?.uid || autoConnectInFlight.current) {
      return;
    }

    autoConnectInFlight.current = true;

    try {
      let connection = getActiveObdConnection();
      if (connection) {
        connectionRef.current = connection;
        setFlowState('applying_profile');
        setStatusMessage('AutoSense conectado. Abriendo datos en vivo...');
        const deviceInfo = await connection.getDeviceInfo();
        deviceInfoRef.current = deviceInfo;
        const activeProfile = await connection.getActiveProfile().catch(() => null);
        if (isManualProfileId(activeProfile?.profileId)) {
          await enterLiveWithActiveProfile(activeProfile.profileId);
          return;
        }
      } else {
        await connectionRef.current?.disconnect().catch(() => undefined);
        connectionRef.current = null;
        deviceInfoRef.current = null;
        setFlowState('connecting_ble');
        setStatusMessage('Buscando AutoSense ESP32 por Bluetooth...');

        connection = await connectToFirstAutoSenseDevice(AUTO_SCAN_TIMEOUT_MS);
        connectionRef.current = connection;
      }
      setFlowState('reading_vin');
      setStatusMessage('ESP32 conectado. Leyendo VIN...');
      const deviceInfo = deviceInfoRef.current ?? await connection.getDeviceInfo();
      deviceInfoRef.current = deviceInfo;
      const vin = await connection.readVin().catch(() => '');

      if (!vin) {
        const activeProfile = await connection.getActiveProfile().catch(() => null);
        if (isManualProfileId(activeProfile?.profileId)) {
          await enterLiveWithActiveProfile(activeProfile.profileId);
          return;
        }

        setManualVehicleId('manual_no_vin');
        setFlowState('manual_profile_required');
        setStatusMessage('No pudimos detectar el VIN automáticamente. Elige un perfil.');
        return;
      }

      setManualVehicleId(`manual_${vin}`);
      try {
        const resolved = await resolveVehicleProfile({ vin });
        setManualVehicleId(resolved.vehicle.vehicleId);
        if (resolved.profileId !== 'vw_passat_2016' || resolved.supportStatus !== 'full') {
          setFlowState('manual_profile_required');
          setStatusMessage('No tenemos perfil verificado para este VIN. Elige un perfil.');
          return;
        }

        await applyConnectedProfile(
          resolved.profileId,
          resolved.vehicle.vehicleId,
          resolved.vehicle,
        );
      } catch {
        setFlowState('manual_profile_required');
        setStatusMessage('No pudimos detectar el VIN automáticamente. Elige un perfil.');
      }
    } catch {
      const failedConnection = connectionRef.current;
      connectionRef.current = null;
      deviceInfoRef.current = null;
      await failedConnection?.disconnect().catch(() => undefined);
      setFlowState('connection_failed');
      setStatusMessage('No se encontró AutoSense. Conecta tu AutoSense por Bluetooth para continuar.');
    } finally {
      autoConnectInFlight.current = false;
    }
  }

  useFocusEffect(
    useCallback(() => {
      if (!firebaseUser?.uid) {
        return undefined;
      }

      if (getActiveObdConnection()) {
        setFlowState('applying_profile');
        setStatusMessage('AutoSense conectado. Abriendo datos en vivo...');
        router.replace('/realtime/live');
        return undefined;
      }

      setFlowState('connecting_ble');
      setStatusMessage('Buscando AutoSense ESP32 por Bluetooth...');
      const timer = setTimeout(() => {
        void handleAutoConnect();
      }, 350);

      return () => clearTimeout(timer);
      // ponytail: focus-start scan; callback deps would not improve this mounted tab flow.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [firebaseUser?.uid]),
  );

  async function handleManualProfile(profileId: ManualProfile['id']) {
    if (!firebaseUser?.uid || isBusyState(flowState)) {
      return;
    }

    try {
      await applyConnectedProfile(profileId, manualVehicleId);
    } catch (error) {
      console.error('[obd] manual profile apply failed', error);
      const message = error instanceof Error ? error.message : 'Error desconocido.';
      if (connectionRef.current) {
        setFlowState('manual_profile_required');
        setStatusMessage(`No se pudo aplicar el perfil: ${message}`);
      } else {
        setFlowState('connection_failed');
        setStatusMessage('Conecta tu AutoSense por Bluetooth para continuar.');
      }
    }
  }

  return (
    <AppScreen contentPaddingHorizontal={16} contentTopPadding={12}>
      <View style={styles.page}>
        {flowState === 'connection_failed' ? (
          <View style={styles.offlineHero}>
            <Image resizeMode="cover" source={heroCarSource} style={styles.offlineImage} />
            <View style={styles.offlineWash} />

            <View style={styles.offlinePill}>
              <Radio color={PENCIL.accent} size={15} strokeWidth={2.3} />
              <Text style={styles.offlinePillText}>AutoSense no encontrado</Text>
            </View>

            <View style={styles.offlineBody}>
              <View style={styles.offlineIcon}>
                <RefreshCcw color={PENCIL.warning} size={28} strokeWidth={2.2} />
              </View>
              <Text style={styles.offlineTitle}>Conecta tu AutoSense</Text>
              <Text selectable style={styles.offlineText}>
                Enciende el ESP32, mantén Bluetooth activo y vuelve a buscar para iniciar la lectura OBD2.
              </Text>
            </View>

            <View style={styles.offlineSteps}>
              <View style={styles.offlineStep}>
                <Bluetooth color={PENCIL.accent} size={16} strokeWidth={2.2} />
                <Text style={styles.offlineStepText}>Bluetooth</Text>
              </View>
              <View style={styles.offlineStep}>
                <CarFront color={PENCIL.success} size={16} strokeWidth={2.2} />
                <Text style={styles.offlineStepText}>OBD2 listo</Text>
              </View>
            </View>

            <View style={styles.offlineAction}>
              <Button
                className="w-full"
                onPress={() => {
                  void handleAutoConnect();
                }}
                size="lg"
                variant="primary"
              >
                <Button.Label>Buscar otra vez</Button.Label>
              </Button>
            </View>
          </View>
        ) : (
          <>
            {!showProfiles ? (
              <View style={styles.busyHero}>
                <View style={styles.busyPill}>
                  <Radio color={PENCIL.accent} size={15} strokeWidth={2.3} />
                  <Text style={styles.busyPillText}>Realtime OBD2</Text>
                </View>

                <View style={styles.busyStage}>
                  <View style={styles.busyRing}>
                    <View style={styles.busyCore}>
                      {flowState === 'applying_profile' ? (
                        <CheckCircle2 color={PENCIL.success} size={34} strokeWidth={2.2} />
                      ) : flowState === 'reading_vin' ? (
                        <CarFront color={PENCIL.accent} size={34} strokeWidth={2.2} />
                      ) : (
                        <Bluetooth color={PENCIL.accent} size={34} strokeWidth={2.2} />
                      )}
                      <ActivityIndicator
                        color={flowState === 'applying_profile' ? PENCIL.success : PENCIL.accent}
                        size="small"
                        style={styles.busySpinner}
                      />
                    </View>
                  </View>

                  <View style={styles.signalBars}>
                    <View style={[styles.signalBar, styles.signalBarShort]} />
                    <View style={[styles.signalBar, styles.signalBarMid]} />
                    <View style={[styles.signalBar, styles.signalBarTall]} />
                  </View>
                </View>

                <View style={styles.busyCopy}>
                  <Text style={styles.busyTitle}>{screenTitle}</Text>
                  <Text selectable style={styles.busyText}>{statusMessage}</Text>
                </View>

                <View style={styles.busySteps}>
                  {[
                    { label: 'Bluetooth', icon: <Bluetooth color={busyStep >= 0 ? PENCIL.accent : PENCIL.muted} size={15} strokeWidth={2.2} /> },
                    { label: 'VIN', icon: <CarFront color={busyStep >= 1 ? PENCIL.accent : PENCIL.muted} size={15} strokeWidth={2.2} /> },
                    { label: 'Perfil', icon: <CheckCircle2 color={busyStep >= 2 ? PENCIL.success : PENCIL.muted} size={15} strokeWidth={2.2} /> },
                  ].map((step, index) => (
                    <View
                      key={step.label}
                      style={[
                        styles.busyStep,
                        index <= busyStep ? styles.busyStepActive : null,
                      ]}
                    >
                      {step.icon}
                      <Text
                        style={[
                          styles.busyStepText,
                          index <= busyStep ? styles.busyStepTextActive : null,
                        ]}
                      >
                        {step.label}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={styles.busyFooter}>
                  <Text style={styles.busyFooterText}>
                    Mantén el ESP32 encendido y cerca del teléfono.
                  </Text>
                </View>
              </View>
            ) : (
              <>
                <View style={styles.hero}>
                  <View style={styles.heroIcon}>
                    <Radio color={PENCIL.accent} size={28} strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={styles.kicker}>Realtime OBD2</Text>
                    <Text style={styles.title}>{screenTitle}</Text>
                    <Text selectable style={styles.subtitle}>
                      {statusMessage}
                    </Text>
                  </View>
                </View>

                <View style={styles.actionRow}>
                  <Button
                    className="flex-1"
                    isDisabled={isBusy}
                    onPress={() => {
                      void handleAutoConnect();
                    }}
                    size="lg"
                    variant="primary"
                  >
                    <Button.Label>{isBusy ? 'Trabajando...' : 'Buscar otra vez'}</Button.Label>
                  </Button>
                  <View style={styles.scanBadge}>
                    <RefreshCcw color={PENCIL.accent} size={18} strokeWidth={2.2} />
                  </View>
                </View>

                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Elige tu perfil</Text>
                  <Text style={styles.sectionSubtitle}>Solo si no detecta automático</Text>
                </View>

                <View style={styles.cards}>
                  {MANUAL_PROFILES.map((item) => (
                    <Pressable
                      accessibilityRole="button"
                      disabled={isBusy}
                      key={item.id}
                      onPress={() => {
                        void handleManualProfile(item.id);
                      }}
                      style={({ pressed }) => [
                        styles.profileCard,
                        pressed ? styles.profileCardPressed : null,
                      ]}
                    >
                      <View style={styles.profileIcon}>
                        {item.id === 'vw_passat_2016' ? (
                          <CarFront color={PENCIL.accent} size={20} strokeWidth={2.2} />
                        ) : item.id === 'obd2_simulator' ? (
                          <Cpu color={PENCIL.warning} size={20} strokeWidth={2.2} />
                        ) : (
                          <Gauge color={PENCIL.success} size={20} strokeWidth={2.2} />
                        )}
                      </View>

                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={styles.cardTitle}>{item.title}</Text>
                        <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
                      </View>

                      <View style={styles.cardBadge}>
                        <CheckCircle2 color={PENCIL.success} size={13} strokeWidth={2.2} />
                        <Text style={styles.cardBadgeText}>{item.badge}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
          </>
        )}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: 16,
  },
  busyHero: {
    minHeight: 660,
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 18,
    padding: 22,
    borderRadius: 30,
    borderCurve: 'continuous',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    boxShadow: '0 18px 46px rgba(15, 23, 42, 0.10)',
  },
  busyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: PENCIL.accentSoft,
    borderWidth: 1,
    borderColor: PENCIL.accentBorder,
  },
  busyPillText: {
    color: PENCIL.accent,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  busyStage: {
    alignItems: 'center',
    gap: 18,
  },
  busyRing: {
    width: 168,
    height: 168,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  busyCore: {
    width: 92,
    height: 92,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: PENCIL.accentSoft,
    borderWidth: 1,
    borderColor: PENCIL.accentBorder,
  },
  busySpinner: {
    transform: [{ scale: 0.85 }],
  },
  signalBars: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 7,
  },
  signalBar: {
    width: 8,
    borderRadius: 999,
    backgroundColor: PENCIL.accent,
  },
  signalBarShort: {
    height: 14,
    opacity: 0.42,
  },
  signalBarMid: {
    height: 23,
    opacity: 0.68,
  },
  signalBarTall: {
    height: 32,
  },
  busyCopy: {
    alignItems: 'center',
    gap: 9,
  },
  busyTitle: {
    maxWidth: 300,
    color: PENCIL.text,
    textAlign: 'center',
    fontSize: 33,
    lineHeight: 36,
    fontWeight: '900',
  },
  busyText: {
    maxWidth: 296,
    color: PENCIL.muted,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  busySteps: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
  },
  busyStep: {
    flex: 1,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  busyStepActive: {
    backgroundColor: PENCIL.accentSoft,
    borderColor: PENCIL.accentBorder,
  },
  busyStepText: {
    color: PENCIL.muted,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
  },
  busyStepTextActive: {
    color: PENCIL.accent,
  },
  busyFooter: {
    width: '100%',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: PENCIL.successSoft,
    borderWidth: 1,
    borderColor: PENCIL.successBorder,
  },
  busyFooterText: {
    color: PENCIL.success,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  offlineHero: {
    minHeight: 660,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    gap: 18,
    padding: 18,
    borderRadius: 30,
    borderCurve: 'continuous',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    boxShadow: '0 18px 46px rgba(15, 23, 42, 0.10)',
  },
  offlineImage: {
    position: 'absolute',
    top: -16,
    left: -28,
    right: -28,
    height: 360,
    opacity: 0.7,
  },
  offlineWash: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 250,
    height: 190,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  offlinePill: {
    position: 'absolute',
    top: 18,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  offlinePillText: {
    color: PENCIL.accent,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  offlineBody: {
    alignItems: 'center',
    gap: 12,
  },
  offlineIcon: {
    width: 76,
    height: 76,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  offlineTitle: {
    maxWidth: 285,
    color: PENCIL.text,
    textAlign: 'center',
    fontSize: 34,
    lineHeight: 37,
    fontWeight: '900',
  },
  offlineText: {
    maxWidth: 300,
    color: PENCIL.muted,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  offlineSteps: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  offlineStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  offlineStepText: {
    color: PENCIL.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  offlineAction: {
    width: '100%',
  },
  hero: {
    minHeight: 210,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 14,
    borderRadius: 28,
    borderCurve: 'continuous',
    padding: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    boxShadow: '0 18px 46px rgba(15, 23, 42, 0.10)',
  },
  heroIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PENCIL.accentSoft,
    borderWidth: 1,
    borderColor: PENCIL.accentBorder,
  },
  kicker: {
    color: PENCIL.accent,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  title: {
    color: PENCIL.text,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '900',
  },
  subtitle: {
    color: PENCIL.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  connectingPanel: {
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 18,
    borderRadius: 24,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  bluetoothBadge: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PENCIL.accentSoft,
    borderWidth: 1,
    borderColor: PENCIL.accentBorder,
  },
  connectingTitle: {
    color: PENCIL.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
  },
  connectingText: {
    maxWidth: 280,
    color: PENCIL.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  scanBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionHeader: {
    gap: 2,
  },
  sectionTitle: {
    color: PENCIL.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: PENCIL.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  cards: {
    gap: 10,
  },
  profileCard: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 22,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  profileCardPressed: {
    transform: [{ scale: 0.99 }],
    backgroundColor: '#F8FAFC',
  },
  profileIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardTitle: {
    color: PENCIL.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
  },
  cardSubtitle: {
    color: PENCIL.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  cardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: PENCIL.successSoft,
    borderWidth: 1,
    borderColor: PENCIL.successBorder,
  },
  cardBadgeText: {
    color: PENCIL.success,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
  },
});
