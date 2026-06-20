import { router } from 'expo-router';
import {
  KeyRound,
  Mail,
  UserRound,
} from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { useSession } from '@/components/providers/session-provider';
import {
  AppScreen,
  DetailHeader,
  ListRow,
  PENCIL,
  ProfileAvatar,
  SurfaceCard,
} from '@/components/pencil-ui';
import { getInitials } from '@/lib/autosense-data';
import { backOrFallback } from '@/lib/navigation';

export default function ProfileDetailsScreen() {
  const { profile } = useSession();

  if (!profile) {
    return null;
  }

  const providerLabel =
    profile.provider === 'password' ? 'Email y contrasena' : 'Google';

  return (
    <AppScreen
      contentTopPadding={8}
      header={(
        <DetailHeader
          onBack={() => backOrFallback('/profile')}
          title="Editar cuenta"
        />
      )}
    >
      <View style={styles.page}>
        <SurfaceCard padding={0}>
          <ProfileAvatar
            borderless
            initials={getInitials(profile.displayName)}
            label={profile.displayName}
            photoURL={profile.photoURL}
            subtitle={profile.email}
          />
        </SurfaceCard>

        <SurfaceCard padding={0}>
          <ListRow
            borderless
            icon={<UserRound color={PENCIL.accent} size={18} strokeWidth={2.1} />}
            subtitle={profile.phoneNumber || 'Foto, nombre y telefono'}
            title="Perfil"
            value="Abrir"
            valueColor={PENCIL.accent}
            onPress={() => router.push('/profile/personal')}
          />
        </SurfaceCard>

        <SurfaceCard padding={0}>
          <ListRow
            borderless
            icon={<Mail color={PENCIL.success} size={18} strokeWidth={2.1} />}
            subtitle={`${profile.email} · ${providerLabel}`}
            title="Correo"
            value="Abrir"
            valueColor={PENCIL.success}
            onPress={() => router.push('/profile/email')}
          />
        </SurfaceCard>

        <SurfaceCard padding={0}>
          <ListRow
            borderless
            icon={<KeyRound color={PENCIL.warning} size={18} strokeWidth={2.1} />}
            subtitle={
              profile.provider === 'password'
                ? 'Tu contrasena actual y la nueva.'
                : 'Google la gestiona fuera de la app.'
            }
            title="Contrasena"
            value="Abrir"
            valueColor={PENCIL.warning}
            onPress={() => router.push('/profile/password')}
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
