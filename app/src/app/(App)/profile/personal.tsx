import { useState, type ReactNode } from 'react';
import { Camera, Phone, UserRound } from 'lucide-react-native';
import { Button, InputGroup, Label, TextField } from 'heroui-native';
import { StyleSheet, Text, View, type TextInputProps } from 'react-native';

import { useSession } from '@/components/providers/session-provider';
import {
  AppScreen,
  DetailHeader,
  PENCIL,
  ProfileAvatar,
  SectionTitle,
  SurfaceCard,
} from '@/components/pencil-ui';
import {
  firebaseAuthErrorMessage,
  updateAccountDetails,
  uploadProfilePhoto,
} from '@/lib/auth-client';
import { getInitials } from '@/lib/autosense-data';
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

export default function ProfilePersonalScreen() {
  const { firebaseUser, profile } = useSession();
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [phoneNumber, setPhoneNumber] = useState(profile?.phoneNumber ?? '');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  if (!firebaseUser || !profile) {
    return null;
  }

  const currentUser = firebaseUser;
  const currentProfile = profile;

  async function handleUploadPhoto() {
    if (isUploading) {
      return;
    }

    setErrorMessage('');
    setIsUploading(true);

    try {
      await uploadProfilePhoto(currentUser);
    } catch (error) {
      setErrorMessage(firebaseAuthErrorMessage(error));
      return;
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSave() {
    if (isSaving) {
      return;
    }

    if (!displayName.trim()) {
      setErrorMessage('Escribe tu nombre para guardarlo.');
      return;
    }

    setErrorMessage('');
    setIsSaving(true);

    try {
      await updateAccountDetails(currentUser, {
        displayName,
        email: currentProfile.email,
        phoneNumber,
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
          title="Perfil"
          subtitle="Foto, nombre y telefono"
        />
      )}
    >
      <View style={styles.page}>
        <SurfaceCard>
          <View style={styles.cardStack}>
            <ProfileAvatar
              initials={getInitials(displayName || profile.displayName)}
              label={displayName || 'AutoSense'}
              photoURL={profile.photoURL}
              subtitle={profile.email}
            />
            <Button
              className="w-full"
              onPress={() => {
                void handleUploadPhoto();
              }}
              size="md"
              variant="secondary"
            >
              <Camera color={PENCIL.accent} size={17} strokeWidth={2.2} />
              <Button.Label>
                {isUploading ? 'Subiendo foto...' : 'Cambiar foto'}
              </Button.Label>
            </Button>
          </View>
        </SurfaceCard>

        <SurfaceCard>
          <View style={styles.cardStack}>
            <SectionTitle
              title="Datos personales"
              caption="Solo tu identidad y contacto."
            />
            <AccountField
              autoCapitalize="words"
              autoComplete="name"
              icon={<UserRound color={PENCIL.accent} size={17} strokeWidth={2.2} />}
              label="Nombre completo"
              onChangeText={setDisplayName}
              placeholder="Tu nombre completo"
              textContentType="name"
              value={displayName}
            />
            <AccountField
              autoComplete="tel"
              icon={<Phone color={PENCIL.success} size={17} strokeWidth={2.2} />}
              keyboardType="phone-pad"
              label="Telefono"
              onChangeText={setPhoneNumber}
              placeholder="+507 6000 0000"
              textContentType="telephoneNumber"
              value={phoneNumber}
            />
          </View>
        </SurfaceCard>

        {errorMessage ? (
          <Text accessibilityRole="alert" style={styles.errorMessage}>
            {errorMessage}
          </Text>
        ) : null}

        <Button
          className="w-full"
          onPress={() => {
            void handleSave();
          }}
          size="lg"
          variant="primary"
        >
          <Button.Label>{isSaving ? 'Guardando...' : 'Guardar perfil'}</Button.Label>
        </Button>
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
});
