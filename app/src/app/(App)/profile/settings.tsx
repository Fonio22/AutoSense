import { useState } from 'react';
import {
  Bell,
  Globe,
  ShieldCheck,
  Thermometer,
  Gauge,
  Fuel,
} from 'lucide-react-native';
import { Button } from 'heroui-native';
import { StyleSheet, View } from 'react-native';

import { useSession } from '@/components/providers/session-provider';
import {
  AppScreen,
  DetailHeader,
  ListRow,
  PENCIL,
  SurfaceCard,
} from '@/components/pencil-ui';
import { updateUserSettings, type AutoSenseUserDoc } from '@/lib/autosense-data';
import { backOrFallback } from '@/lib/navigation';

const SPEED_UNITS: AutoSenseUserDoc['settings']['speedUnit'][] = ['km/h', 'mph'];
const TEMPERATURE_UNITS: AutoSenseUserDoc['settings']['temperatureUnit'][] = ['°C', '°F'];
const CONSUMPTION_UNITS: AutoSenseUserDoc['settings']['consumptionUnit'][] = ['L/100 km', 'km/L'];
const ALERTS_MODES: AutoSenseUserDoc['settings']['alertsMode'][] = ['Activado', 'Solo críticas'];
const DATA_MODES: AutoSenseUserDoc['settings']['dataMode'][] = ['Cloud sync', 'Solo local'];
const PRIVACY_MODES: AutoSenseUserDoc['settings']['privacyMode'][] = ['Rutas privadas', 'Compartir'];

function cycleValue<T extends string>(values: readonly T[], current: T) {
  const currentIndex = values.indexOf(current);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % values.length;
  return values[nextIndex] ?? values[0];
}

export default function ProfileSettingsScreen() {
  const { firebaseUser, profile } = useSession();
  const [draftSettings, setDraftSettings] = useState<AutoSenseUserDoc['settings'] | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const settings = draftSettings ?? profile?.settings ?? null;

  async function handleSave() {
    if (!firebaseUser?.uid || !settings || isSaving) {
      return;
    }

    setIsSaving(true);

    try {
      await updateUserSettings(firebaseUser.uid, settings);
      backOrFallback('/profile');
    } finally {
      setIsSaving(false);
    }
  }

  if (!settings) {
    return null;
  }

  return (
    <AppScreen
      contentTopPadding={8}
      header={(
        <DetailHeader
          onBack={() => backOrFallback('/profile')}
          title="Configuraciones"
          subtitle="Preferencias y privacidad"
        />
      )}
    >
      <View style={styles.page}>
        <SurfaceCard padding={0}>
          <ListRow
            borderless
            icon={<Gauge color={PENCIL.accent} size={18} strokeWidth={2.1} />}
            subtitle="Unidad principal"
            title="Velocidad"
            value={settings.speedUnit}
            valueColor={PENCIL.text}
            onPress={() => {
              setDraftSettings((current) => {
                const base = current ?? settings;
                return {
                  ...base,
                  speedUnit: cycleValue(SPEED_UNITS, base.speedUnit),
                };
              });
            }}
          />
        </SurfaceCard>

        <SurfaceCard padding={0}>
          <ListRow
            borderless
            icon={<Thermometer color={PENCIL.warning} size={18} strokeWidth={2.1} />}
            subtitle="Unidad termica"
            title="Temperatura"
            value={settings.temperatureUnit}
            valueColor={PENCIL.text}
            onPress={() => {
              setDraftSettings((current) => {
                const base = current ?? settings;
                return {
                  ...base,
                  temperatureUnit: cycleValue(
                    TEMPERATURE_UNITS,
                    base.temperatureUnit,
                  ),
                };
              });
            }}
          />
        </SurfaceCard>

        <SurfaceCard padding={0}>
          <ListRow
            borderless
            icon={<Fuel color={PENCIL.success} size={18} strokeWidth={2.1} />}
            subtitle="Formato de consumo"
            title="Consumo"
            value={settings.consumptionUnit}
            valueColor={PENCIL.text}
            onPress={() => {
              setDraftSettings((current) => {
                const base = current ?? settings;
                return {
                  ...base,
                  consumptionUnit: cycleValue(
                    CONSUMPTION_UNITS,
                    base.consumptionUnit,
                  ),
                };
              });
            }}
          />
        </SurfaceCard>

        <SurfaceCard padding={0}>
          <ListRow
            borderless
            icon={<Bell color={PENCIL.warning} size={18} strokeWidth={2.1} />}
            subtitle="Severidad de notificaciones"
            title="Alertas"
            value={settings.alertsMode}
            valueColor={PENCIL.warning}
            onPress={() => {
              setDraftSettings((current) => {
                const base = current ?? settings;
                return {
                  ...base,
                  alertsMode: cycleValue(ALERTS_MODES, base.alertsMode),
                };
              });
            }}
          />
        </SurfaceCard>

        <SurfaceCard padding={0}>
          <ListRow
            borderless
            icon={<ShieldCheck color={PENCIL.success} size={18} strokeWidth={2.1} />}
            subtitle="Sincronizacion"
            title="Datos"
            value={settings.dataMode}
            valueColor={PENCIL.success}
            onPress={() => {
              setDraftSettings((current) => {
                const base = current ?? settings;
                return {
                  ...base,
                  dataMode: cycleValue(DATA_MODES, base.dataMode),
                };
              });
            }}
          />
        </SurfaceCard>

        <SurfaceCard padding={0}>
          <ListRow
            borderless
            icon={<Globe color={PENCIL.accent} size={18} strokeWidth={2.1} />}
            subtitle="Visibilidad del trayecto"
            title="Privacidad"
            value={settings.privacyMode}
            valueColor={PENCIL.accent}
            onPress={() => {
              setDraftSettings((current) => {
                const base = current ?? settings;
                return {
                  ...base,
                  privacyMode: cycleValue(PRIVACY_MODES, base.privacyMode),
                };
              });
            }}
          />
        </SurfaceCard>

        <Button
          className="w-full"
          onPress={() => {
            void handleSave();
          }}
          size="lg"
          variant="primary"
        >
          <Button.Label>{isSaving ? 'Guardando...' : 'Guardar configuraciones'}</Button.Label>
        </Button>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: 14,
  },
});
