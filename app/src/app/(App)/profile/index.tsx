import { router } from 'expo-router';
import {
  CarFront,
  LifeBuoy,
  LogOut,
  Settings2,
  UserRound,
} from 'lucide-react-native';
import { Button } from 'heroui-native';
import { View, StyleSheet } from 'react-native';

import {
  AppScreen,
  ListRow,
  PENCIL,
  ProfileAvatar,
  ScreenTitle,
  SurfaceCard,
} from '@/components/pencil-ui';

export default function ProfileScreen() {
  return (
    <AppScreen contentTopPadding={14}>
      <View style={styles.page}>
        <ScreenTitle title="Mi perfil" />

        <SurfaceCard>
          <ProfileAvatar initials="AZ" label="Antonio Zhong" subtitle="antonio@autosense.ai" />
        </SurfaceCard>

        <SurfaceCard>
          <View style={{ gap: 10 }}>
            <ListRow
              icon={<CarFront color={PENCIL.accent} size={18} strokeWidth={2.1} />}
              subtitle="Honda Civic 1.5T · Activo"
              title="Vehículo actual"
              value="Cambiar"
              valueColor={PENCIL.accent}
              onPress={() => router.push('/profile/settings')}
            />
            <ListRow
              icon={<UserRound color={PENCIL.success} size={18} strokeWidth={2.1} />}
              subtitle="Datos personales y acceso"
              title="Perfil"
              value="Editar"
              valueColor={PENCIL.success}
              onPress={() => router.push('/profile/details')}
            />
            <ListRow
              icon={<Settings2 color={PENCIL.muted} size={18} strokeWidth={2.1} />}
              subtitle="Preferencias y privacidad"
              title="Configuraciones"
              value="Abrir"
              valueColor={PENCIL.muted}
              onPress={() => router.push('/profile/settings')}
            />
          </View>
        </SurfaceCard>

        <SurfaceCard tone="soft">
          <View style={{ gap: 10 }}>
            <ListRow
              icon={<LifeBuoy color={PENCIL.accent} size={18} strokeWidth={2.1} />}
              subtitle="Centro de ayuda y contacto"
              title="Soporte"
            />
            <ListRow
              icon={<LogOut color={PENCIL.danger} size={18} strokeWidth={2.1} />}
              subtitle="Cerrar sesión de forma segura"
              title="Salir"
              value="Cerrar"
              valueColor={PENCIL.danger}
            />
          </View>
        </SurfaceCard>

        <Button
          className="w-full"
          onPress={() => router.push('/profile/details')}
          size="lg"
          variant="primary"
        >
          <Button.Label>Editar perfil</Button.Label>
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
