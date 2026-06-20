import { useState, type ReactNode } from 'react';
import { LockKeyhole, Mail, ShieldCheck } from 'lucide-react-native';
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

export default function ProfileEmailScreen() {
  const { firebaseUser, profile } = useSession();
  const [email, setEmail] = useState(profile?.email ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!firebaseUser || !profile) {
    return null;
  }

  const isPasswordProvider = profile.provider === 'password';
  const providerLabel = isPasswordProvider ? 'Email y contrasena' : 'Google';
  const trimmedEmail = email.trim();

  async function handleSave() {
    if (isSaving || !isPasswordProvider) {
      return;
    }

    if (!trimmedEmail) {
      setErrorMessage('Escribe un correo para guardarlo.');
      setSuccessMessage('');
      return;
    }

    if (trimmedEmail === profile.email.trim()) {
      setErrorMessage('Escribe un correo distinto para actualizarlo.');
      setSuccessMessage('');
      return;
    }

    if (!currentPassword.trim()) {
      setErrorMessage('Ingresa tu contrasena actual para confirmar el cambio.');
      setSuccessMessage('');
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setIsSaving(true);

    try {
      const result = await updateAccountDetails(firebaseUser, {
        currentPassword,
        displayName: profile.displayName,
        email: trimmedEmail,
        phoneNumber: profile.phoneNumber,
      });
      setCurrentPassword('');

      if (result.emailChangeRequiresVerification) {
        setSuccessMessage('Revisa el correo nuevo para confirmar el cambio.');
        return;
      }

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
          title="Correo"
          subtitle="Email principal y acceso"
        />
      )}
    >
      <View style={styles.page}>
        <SurfaceCard>
          <View style={styles.cardStack}>
            <SectionTitle
              title="Metodo de acceso"
              caption={`Tu cuenta entra con ${providerLabel}.`}
            />
            <View style={styles.providerPill}>
              <ShieldCheck color={PENCIL.success} size={16} strokeWidth={2.2} />
              <Text style={styles.providerText}>{providerLabel}</Text>
            </View>
            <AccountField
              autoCapitalize="none"
              autoCorrect={false}
              editable={isPasswordProvider}
              icon={<Mail color={PENCIL.accent} size={17} strokeWidth={2.2} />}
              keyboardType="email-address"
              label="Correo principal"
              onChangeText={setEmail}
              placeholder="tu@correo.com"
              textContentType="emailAddress"
              value={email}
            />
            {isPasswordProvider ? (
              <AccountField
                autoComplete="current-password"
                icon={<LockKeyhole color={PENCIL.warning} size={17} strokeWidth={2.2} />}
                label="Contrasena actual"
                onChangeText={setCurrentPassword}
                placeholder="Confirma tu contrasena"
                secureTextEntry
                textContentType="password"
                value={currentPassword}
              />
            ) : (
              <Text style={styles.helperText}>
                Las cuentas con Google muestran el correo del proveedor y no lo cambian desde aqui.
              </Text>
            )}
          </View>
        </SurfaceCard>

        {errorMessage ? (
          <Text accessibilityRole="alert" style={styles.errorMessage}>
            {errorMessage}
          </Text>
        ) : null}
        {successMessage ? (
          <Text accessibilityRole="alert" style={styles.successMessage}>
            {successMessage}
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
            <Button.Label>{isSaving ? 'Guardando...' : 'Guardar correo'}</Button.Label>
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
  helperText: {
    color: PENCIL.muted,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
  },
  page: {
    gap: 14,
  },
  providerPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: PENCIL.successSoft,
    borderColor: PENCIL.successBorder,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  providerText: {
    color: PENCIL.success,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  successMessage: {
    color: PENCIL.success,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
});
