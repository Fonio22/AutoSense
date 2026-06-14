import { router } from 'expo-router';
import {
  Bell,
  CarFront,
  Globe,
  ShieldCheck,
  SlidersHorizontal,
  Thermometer,
  Gauge,
  Fuel,
} from 'lucide-react-native';
import { Button } from 'heroui-native';
import { View, StyleSheet } from 'react-native';

import {
  AppScreen,
  DetailHeader,
  ListRow,
  PENCIL,
  SurfaceCard,
} from '@/components/pencil-ui';
import { backOrFallback } from '@/lib/navigation';

export default function ProfileSettingsScreen() {
  return (
    <AppScreen
      contentTopPadding={8}
      header={(
        <DetailHeader
          onBack={() => backOrFallback('/profile')}
          title="Configuraciones"
        />
      )}
    >
      <View style={styles.page}>
        <SurfaceCard>
          <View style={{ gap: 10 }}>
            <ListRow
              icon={<Gauge color={PENCIL.accent} size={18} strokeWidth={2.1} />}
              subtitle="km/h"
              title="Velocidad"
              value="km/h"
              valueColor={PENCIL.text}
            />
            <ListRow
              icon={<Thermometer color={PENCIL.warning} size={18} strokeWidth={2.1} />}
              subtitle="Celsius"
              title="Temperatura"
              value="°C"
              valueColor={PENCIL.text}
            />
            <ListRow
              icon={<Fuel color={PENCIL.success} size={18} strokeWidth={2.1} />}
              subtitle="Litros por 100 km"
              title="Consumo"
              value="L/100 km"
              valueColor={PENCIL.text}
            />
          </View>
        </SurfaceCard>

        <SurfaceCard>
          <View style={{ gap: 10 }}>
            <ListRow
              icon={<Bell color={PENCIL.warning} size={18} strokeWidth={2.1} />}
              subtitle="Alta y media"
              title="Alertas"
              value="Activado"
              valueColor={PENCIL.warning}
            />
            <ListRow
              icon={<ShieldCheck color={PENCIL.success} size={18} strokeWidth={2.1} />}
              subtitle="Historial local"
              title="Datos"
              value="Local"
              valueColor={PENCIL.success}
            />
            <ListRow
              icon={<Globe color={PENCIL.accent} size={18} strokeWidth={2.1} />}
              subtitle="Exportación CSV"
              title="Privacidad"
              value="Bloqueados"
              valueColor={PENCIL.accent}
            />
          </View>
        </SurfaceCard>

        <SurfaceCard tone="soft">
          <View style={styles.carRow}>
            <CarFront color={PENCIL.accent} size={18} strokeWidth={2.1} />
            <View style={{ flex: 1 }}>
              <ListRow
                icon={<SlidersHorizontal color={PENCIL.muted} size={18} strokeWidth={2.1} />}
                subtitle="Puedes ajustar las reglas desde esta sección"
                title="Configuración avanzada"
                value="Editar"
                valueColor={PENCIL.muted}
              />
            </View>
          </View>
        </SurfaceCard>

        <Button
          className="w-full"
          onPress={() => router.push('/profile/details')}
          size="lg"
          variant="primary"
        >
          <Button.Label>Guardar ajustes</Button.Label>
        </Button>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: 14,
  },
  carRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
});
