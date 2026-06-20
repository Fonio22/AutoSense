import { router } from 'expo-router';
import { useState } from 'react';
import { Button, Chip } from 'heroui-native';
import {
  Bluetooth,
  CarFront,
  Fuel,
  ShieldCheck,
} from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/components/providers/session-provider';
import {
  AppScreen,
  DetailHeader,
  ListRow,
  PENCIL,
  SectionTitle,
  SurfaceCard,
} from '@/components/pencil-ui';
import { updateUserVehicle } from '@/lib/autosense-data';
import { backOrFallback } from '@/lib/navigation';

const VEHICLE_PRESETS = [
  {
    name: 'Honda Civic 1.5T',
    note: 'Sedan turbo para ciudad',
    fuelTankLiters: 58,
  },
  {
    name: 'Toyota RAV4 Hybrid',
    note: 'SUV hibrida para uso mixto',
    fuelTankLiters: 55,
  },
  {
    name: 'Ford Ranger 2.0',
    note: 'Pickup para carga y ruta',
    fuelTankLiters: 80,
  },
  {
    name: 'Kia Rio Hatchback',
    note: 'Hatchback compacto urbano',
    fuelTankLiters: 45,
  },
] as const;

const VEHICLE_STATUS_OPTIONS = [
  'Activo',
  'En revision',
  'Listo para emparejar',
] as const;

const TANK_OPTIONS = [45, 55, 58, 65, 80] as const;

const ADAPTER_OPTIONS = [
  'OBD2 Bluetooth',
  'Vgate iCar Pro',
  'ELM327 Wi-Fi',
] as const;

const LINK_OPTIONS = [
  {
    statusLabel: 'Conectado y transmitiendo',
    signalLabel: 'Lectura en vivo',
  },
  {
    statusLabel: 'Listo para emparejar',
    signalLabel: 'Señal estable',
  },
  {
    statusLabel: 'Pendiente de cambio',
    signalLabel: 'Empareja otro OBD2',
  },
] as const;

function cycleValue<T extends string | number>(values: readonly T[], current: T) {
  const currentIndex = values.indexOf(current);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % values.length;
  return values[nextIndex] ?? values[0];
}

function nextVehiclePreset(currentName: string) {
  const currentIndex = VEHICLE_PRESETS.findIndex((vehicle) => vehicle.name === currentName);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % VEHICLE_PRESETS.length;
  return VEHICLE_PRESETS[nextIndex] ?? VEHICLE_PRESETS[0];
}

function summaryForVehicle(name: string, statusLabel: string) {
  return `${name} · ${statusLabel}`;
}

export default function ProfileVehicleScreen() {
  const { firebaseUser, profile } = useSession();
  const [draftVehicle, setDraftVehicle] = useState(profile?.vehicle ?? null);
  const [draftAdapter, setDraftAdapter] = useState(
    profile?.realtime?.deviceLabel ?? ADAPTER_OPTIONS[0],
  );
  const [draftLink, setDraftLink] = useState(
    LINK_OPTIONS.find(
      (option) => option.statusLabel === profile?.realtime?.statusLabel,
    ) ?? LINK_OPTIONS[1],
  );
  const [isSaving, setIsSaving] = useState(false);

  if (!firebaseUser?.uid || !profile || !draftVehicle) {
    return null;
  }

  const preset =
    VEHICLE_PRESETS.find((vehicle) => vehicle.name === draftVehicle.name)
    ?? VEHICLE_PRESETS[0];

  async function handleSave() {
    if (isSaving) {
      return;
    }

    setIsSaving(true);

    try {
      await updateUserVehicle(firebaseUser.uid, {
        ...draftVehicle,
        summary: summaryForVehicle(draftVehicle.name, draftVehicle.statusLabel),
      }, {
        deviceLabel: draftAdapter,
        signalLabel: draftLink.signalLabel,
        statusLabel: draftLink.statusLabel,
      });
      backOrFallback('/profile');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppScreen
      contentBottomPadding={12}
      contentTopPadding={8}
      scroll={false}
      header={(
        <DetailHeader
          onBack={() => backOrFallback('/profile')}
          title="Vehiculo actual"
          subtitle="Modelo, estado y OBD2"
        />
      )}
    >
      <View style={styles.page}>
        <ScrollView
          contentContainerStyle={styles.pageContent}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.pageScroll}
        >
          <SurfaceCard>
            <View style={styles.heroCard}>
              <View style={styles.heroIcon}>
                <CarFront color={PENCIL.accent} size={24} strokeWidth={2.1} />
              </View>

              <View style={styles.heroCopy}>
                <Text selectable style={styles.heroTitle}>
                  {draftVehicle.name}
                </Text>
                <Text selectable style={styles.heroSubtitle}>
                  {preset.note} · tanque {draftVehicle.fuelTankLiters} L
                </Text>
              </View>

              <Chip color="accent" size="sm" variant="soft">
                <Chip.Label>{draftVehicle.statusLabel}</Chip.Label>
              </Chip>
            </View>
          </SurfaceCard>

          <SectionTitle
            title="Perfil del vehiculo"
            caption="Cambia el tipo base que ve tu cuenta."
          />

          <SurfaceCard padding={0}>
            <ListRow
              borderless
              icon={<CarFront color={PENCIL.accent} size={18} strokeWidth={2.1} />}
              subtitle={preset.note}
              title="Tipo de vehiculo"
              value={draftVehicle.name}
              valueColor={PENCIL.accent}
              onPress={() => {
                const nextPreset = nextVehiclePreset(draftVehicle.name);
                setDraftVehicle((current) => {
                  if (!current) {
                    return current;
                  }

                  return {
                    ...current,
                    fuelTankLiters: nextPreset.fuelTankLiters,
                    name: nextPreset.name,
                  };
                });
              }}
            />
          </SurfaceCard>

          <SurfaceCard padding={0}>
            <ListRow
              borderless
              icon={<ShieldCheck color={PENCIL.success} size={18} strokeWidth={2.1} />}
              subtitle="Lo que muestras como estado principal"
              title="Estado"
              value={draftVehicle.statusLabel}
              valueColor={PENCIL.success}
              onPress={() => {
                setDraftVehicle((current) => {
                  if (!current) {
                    return current;
                  }

                  return {
                    ...current,
                    statusLabel: cycleValue(
                      VEHICLE_STATUS_OPTIONS,
                      current.statusLabel as (typeof VEHICLE_STATUS_OPTIONS)[number],
                    ),
                  };
                });
              }}
            />
          </SurfaceCard>

          <SurfaceCard padding={0}>
            <ListRow
              borderless
              icon={<Fuel color={PENCIL.warning} size={18} strokeWidth={2.1} />}
              subtitle="Capacidad usada para rangos y consumo"
              title="Tanque"
              value={`${draftVehicle.fuelTankLiters} L`}
              valueColor={PENCIL.warning}
              onPress={() => {
                setDraftVehicle((current) => {
                  if (!current) {
                    return current;
                  }

                  return {
                    ...current,
                    fuelTankLiters: cycleValue(TANK_OPTIONS, current.fuelTankLiters),
                  };
                });
              }}
            />
          </SurfaceCard>

          <SectionTitle
            title="OBD2 y emparejamiento"
            caption="Deja listo el adaptador que vas a usar."
          />

          <SurfaceCard padding={0}>
            <ListRow
              borderless
              icon={<Bluetooth color={PENCIL.accent} size={18} strokeWidth={2.1} />}
              subtitle="Modulo principal del vehiculo"
              title="Adaptador OBD2"
              value={draftAdapter}
              valueColor={PENCIL.accent}
              onPress={() => {
                setDraftAdapter((current) => cycleValue(ADAPTER_OPTIONS, current));
              }}
            />
          </SurfaceCard>

          <SurfaceCard padding={0}>
            <ListRow
              borderless
              icon={<ShieldCheck color={PENCIL.success} size={18} strokeWidth={2.1} />}
              subtitle={draftLink.signalLabel}
              title="Emparejamiento"
              value={draftLink.statusLabel}
              valueColor={PENCIL.success}
              onPress={() => {
                setDraftLink((current) => {
                  const currentIndex = LINK_OPTIONS.findIndex(
                    (option) => option.statusLabel === current.statusLabel,
                  );
                  const nextIndex = currentIndex === -1
                    ? 0
                    : (currentIndex + 1) % LINK_OPTIONS.length;
                  return LINK_OPTIONS[nextIndex] ?? LINK_OPTIONS[0];
                });
              }}
            />
          </SurfaceCard>

          <SurfaceCard padding={0}>
            <ListRow
              borderless
              icon={<Bluetooth color={PENCIL.accent} size={18} strokeWidth={2.1} />}
              subtitle={`Actual: ${draftAdapter}`}
              title="Emparejar otro OBD2"
              value="Abrir"
              valueColor={PENCIL.accent}
              onPress={() => router.push('/realtime')}
            />
          </SurfaceCard>
        </ScrollView>

        <Button
          className="w-full"
          onPress={() => {
            void handleSave();
          }}
          size="lg"
          variant="primary"
        >
          <Button.Label>{isSaving ? 'Guardando...' : 'Guardar vehiculo'}</Button.Label>
        </Button>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  heroCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: PENCIL.accentSoft,
    borderRadius: 16,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  heroSubtitle: {
    color: PENCIL.muted,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  heroTitle: {
    color: PENCIL.text,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
  },
  page: {
    flex: 1,
    gap: 14,
  },
  pageContent: {
    gap: 14,
    paddingBottom: 120,
  },
  pageScroll: {
    flex: 1,
    minHeight: 0,
  },
});
