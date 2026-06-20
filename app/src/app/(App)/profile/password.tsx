import { useState, type ReactNode } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react-native';
import { Button, InputGroup, Label, TextField } from 'heroui-native';
import { StyleSheet, Text, View, type TextInputProps } from 'react-native';

import { useSession } from '@/components/providers/session-provider';
import {
  AppScreen,
  DetailHeader,
  PENCIL,
  SectionTitle,
  SurfaceCard,
} from '@/components/pencil-ui';
import {
  firebaseAuthErrorMessage,
  updateAccountDetails,
} from '@/lib/auth-client';
import { backOrFallback } from '@/lib/navigation';

function AccountField({
  icon,
  label,
  ...inputProps
}: {
  icon: ReactNode;
  label: string;
} & TextInputProps) {
  return (
    <TextField style={styles.fieldGroup}>
      <Label className="text-[13px] font-bold text-[#111827]">{label}</Label>
      <InputGroup>
        <InputGroup.Prefix isDecorative>{icon}</InputGroup.Prefix>
        <InputGroup.Input
          placeholderTextColor="#9CA3AF"
          selectionColor={PENCIL.accent}
          {...inputProps}
        />
      </InputGroup>
    </TextField>
  );
}

export default function ProfilePasswordScreen() {
  const { firebaseUser, profile } = useSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!firebaseUser || !profile) {
    return null;
  }

  const isPasswordProvider = profile.provider === 'password';

  async function handleSave() {
    if (isSaving || !isPasswordProvider) {
      return;
    }

    if (!currentPassword.trim()) {
      setErrorMessage('Ingresa tu contrasena actual.');
      return;
    }

    if (!newPassword.trim()) {
      setErrorMessage('Escribe una nueva contrasena.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Las nuevas contrasenas no coinciden.');
      return;
    }

    setErrorMessage('');
    setIsSaving(true);

    try {
      await updateAccountDetails(firebaseUser, {
        currentPassword,
        displayName: profile.displayName,
        email: profile.email,
        newPassword,
        phoneNumber: profile.phoneNumber,
      });
      backOrFallback('/profile/details');
    } catch (error) {
      setErrorMessage(firebaseAuthErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppScreen
      contentTopPadding={8}
      header={(
        <DetailHeader
          onBack={() => backOrFallback('/profile/details')}
          title="Contrasena"
          subtitle="Seguridad de acceso"
        />
      )}
    >
      <View style={styles.page}>
        <SurfaceCard>
          <View style={styles.cardStack}>
            <SectionTitle
              title="Seguridad"
              caption={
                isPasswordProvider
                  ? 'Confirma la actual y guarda una nueva.'
                  : 'Google gestiona esta contrasena.'
              }
            />
            {isPasswordProvider ? (
              <>
                <AccountField
                  autoComplete="current-password"
                  icon={<KeyRound color={PENCIL.warning} size={17} strokeWidth={2.2} />}
                  label="Contrasena actual"
                  onChangeText={setCurrentPassword}
                  placeholder="Tu contrasena actual"
                  secureTextEntry
                  textContentType="password"
                  value={currentPassword}
                />
                <AccountField
                  autoComplete="new-password"
                  icon={<KeyRound color={PENCIL.success} size={17} strokeWidth={2.2} />}
                  label="Nueva contrasena"
                  onChangeText={setNewPassword}
                  placeholder="Minimo 6 caracteres"
                  secureTextEntry
                  textContentType="newPassword"
                  value={newPassword}
                />
                <AccountField
                  autoComplete="new-password"
                  icon={<KeyRound color={PENCIL.success} size={17} strokeWidth={2.2} />}
                  label="Confirmar nueva contrasena"
                  onChangeText={setConfirmPassword}
                  placeholder="Repite la nueva contrasena"
                  secureTextEntry
                  textContentType="newPassword"
                  value={confirmPassword}
                />
              </>
            ) : (
              <View style={styles.providerBox}>
                <ShieldCheck color={PENCIL.success} size={18} strokeWidth={2.2} />
                <Text style={styles.providerText}>
                  Esta cuenta usa Google. La contrasena se administra fuera de la app.
                </Text>
              </View>
            )}
          </View>
        </SurfaceCard>

        {errorMessage ? (
          <Text accessibilityRole="alert" style={styles.errorMessage}>
            {errorMessage}
          </Text>
        ) : null}

        {isPasswordProvider ? (
          <Button
            className="w-full"
            onPress={() => {
              void handleSave();
            }}
            size="lg"
            variant="primary"
          >
            <Button.Label>
              {isSaving ? 'Guardando...' : 'Guardar contrasena'}
            </Button.Label>
          </Button>
        ) : null}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  cardStack: {
    gap: 12,
  },
  errorMessage: {
    color: '#B42318',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  fieldGroup: {
    gap: 6,
  },
  page: {
    gap: 14,
  },
  providerBox: {
    alignItems: 'center',
    backgroundColor: PENCIL.successSoft,
    borderColor: PENCIL.successBorder,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  providerText: {
    color: PENCIL.success,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
});
