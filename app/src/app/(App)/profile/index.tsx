import { router } from 'expo-router';
import {
  CarFront,
  LifeBuoy,
  LogOut,
  Settings2,
  UserRound,
} from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { useSession } from '@/components/providers/session-provider';
import {
  AppScreen,
  ListRow,
  PENCIL,
  ProfileAvatar,
  ScreenTitle,
  SurfaceCard,
} from '@/components/pencil-ui';
import { getInitials } from '@/lib/autosense-data';

export default function ProfileScreen() {
  const { profile, signOutUser } = useSession();
  const displayName = profile?.displayName ?? 'AutoSense';
  const email = profile?.email ?? 'cuenta@autosense.app';
  const vehicleSummary = profile?.vehicle?.summary ?? 'Vehiculo activo';
  const openProfileEditor = () => router.push('/profile/details');

  return (
    <AppScreen contentTopPadding={14}>
      <View style={styles.page}>
        <ScreenTitle title="Mi perfil" />

        <SurfaceCard padding={0}>
          <ProfileAvatar
            borderless
            initials={getInitials(displayName)}
            label={displayName}
            photoURL={profile?.photoURL}
            subtitle={email}
          />
        </SurfaceCard>

        <SurfaceCard padding={0}>
          <ListRow
            borderless
            icon={<CarFront color={PENCIL.accent} size={18} strokeWidth={2.1} />}
            subtitle={vehicleSummary}
            title="Vehiculo actual"
            value="Cambiar"
            valueColor={PENCIL.accent}
            onPress={() => router.push('/profile/vehicle')}
          />
        </SurfaceCard>

        <SurfaceCard padding={0}>
          <ListRow
            borderless
            icon={<UserRound color={PENCIL.success} size={18} strokeWidth={2.1} />}
            subtitle="Datos personales y acceso"
            title="Perfil"
            value="Editar"
            valueColor={PENCIL.success}
            onPress={openProfileEditor}
          />
        </SurfaceCard>

        <SurfaceCard padding={0}>
          <ListRow
            borderless
            icon={<Settings2 color={PENCIL.muted} size={18} strokeWidth={2.1} />}
            subtitle="Preferencias y privacidad"
            title="Configuraciones"
            value="Abrir"
            valueColor={PENCIL.muted}
            onPress={() => router.push('/profile/settings')}
          />
        </SurfaceCard>

        <SurfaceCard padding={0}>
          <ListRow
            borderless
            icon={<LifeBuoy color={PENCIL.accent} size={18} strokeWidth={2.1} />}
            subtitle="Centro de ayuda y contacto"
            title="Soporte"
          />
        </SurfaceCard>

        <SurfaceCard padding={0}>
          <ListRow
            borderless
            icon={<LogOut color={PENCIL.danger} size={18} strokeWidth={2.1} />}
            subtitle="Cerrar sesion de forma segura"
            title="Salir"
            value="Cerrar"
            valueColor={PENCIL.danger}
            onPress={() => {
              void signOutUser();
            }}
          />
        </SurfaceCard>

      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: 14,
  },
});
