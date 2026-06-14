import { router } from 'expo-router';
import {
  KeyRound,
  Mail,
  Phone,
  ShieldCheck,
  UserRound,
} from 'lucide-react-native';
import { Button } from 'heroui-native';
import { View, StyleSheet } from 'react-native';

import {
  AppScreen,
  DetailHeader,
  ListRow,
  PENCIL,
  ProfileAvatar,
  SurfaceCard,
} from '@/components/pencil-ui';
import { backOrFallback } from '@/lib/navigation';

export default function ProfileDetailsScreen() {
  return (
    <AppScreen
      contentTopPadding={8}
      header={(
        <DetailHeader
          onBack={() => backOrFallback('/profile')}
          title="Mi perfil"
        />
      )}
    >
      <View style={styles.page}>
        <SurfaceCard>
          <ProfileAvatar initials="AZ" label="Antonio Zhong" subtitle="antonio@autosense.ai" />
        </SurfaceCard>

        <SurfaceCard>
          <View style={{ gap: 10 }}>
            <ListRow
              icon={<Mail color={PENCIL.accent} size={18} strokeWidth={2.1} />}
              subtitle="Correo principal"
              title="Email"
              value="antonio@autosense.ai"
              valueColor={PENCIL.text}
            />
            <ListRow
              icon={<Phone color={PENCIL.success} size={18} strokeWidth={2.1} />}
              subtitle="Para alertas y soporte"
              title="Teléfono"
              value="+507 6000 0000"
              valueColor={PENCIL.text}
            />
            <ListRow
              icon={<UserRound color={PENCIL.warning} size={18} strokeWidth={2.1} />}
              subtitle="Usuario administrador"
              title="Rol"
              value="Admin"
              valueColor={PENCIL.warning}
            />
          </View>
        </SurfaceCard>

        <SurfaceCard>
          <View style={{ gap: 10 }}>
            <ListRow
              icon={<KeyRound color={PENCIL.accent} size={18} strokeWidth={2.1} />}
              subtitle="Actualiza cada cierto tiempo"
              title="Contraseña"
              value="Cambiar"
              valueColor={PENCIL.accent}
            />
            <ListRow
              icon={<ShieldCheck color={PENCIL.success} size={18} strokeWidth={2.1} />}
              subtitle="Protege la cuenta con un segundo paso"
              title="Verificación"
              value="Activa"
              valueColor={PENCIL.success}
            />
          </View>
        </SurfaceCard>

        <Button
          className="w-full"
          onPress={() => router.push('/profile/settings')}
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
