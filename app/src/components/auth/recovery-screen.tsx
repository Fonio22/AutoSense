import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Button,
  InputGroup,
  Label,
  LinkButton,
  TextField,
} from 'heroui-native';
import {
  CircleCheck,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Send,
  ShieldCheck,
} from 'lucide-react-native';

import {
  AppScreen,
  IconBubble,
  PENCIL,
  SurfaceCard,
  useNativeButtonColors,
} from '@/components/pencil-ui';

function RecoveryField({
  label,
  placeholder,
  leftIcon,
  rightIcon,
  secureTextEntry,
  onRightPress,
  value,
  onChangeText,
}: {
  label: string;
  placeholder: string;
  leftIcon: React.ReactNode;
  rightIcon?: React.ReactNode;
  secureTextEntry?: boolean;
  onRightPress?: () => void;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <TextField style={styles.fieldGroup}>
      <Label className="text-[13px] font-extrabold text-[#111827]">
        {label}
      </Label>

      <InputGroup>
        <InputGroup.Prefix isDecorative>
          {leftIcon}
        </InputGroup.Prefix>
        <InputGroup.Input
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          secureTextEntry={secureTextEntry}
          selectionColor={PENCIL.accent}
          onChangeText={onChangeText}
          value={value}
        />

        {rightIcon ? (
          <InputGroup.Suffix>
            <Pressable
              accessibilityLabel="Alternar visibilidad"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onRightPress}
            >
              {rightIcon}
            </Pressable>
          </InputGroup.Suffix>
        ) : null}
      </InputGroup>
    </TextField>
  );
}

function RecoveryStepCard({
  number,
  title,
  description,
  active = false,
  children,
}: {
  number: number;
  title: string;
  description: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <SurfaceCard
      className={
        active ? 'border-[#BFDBFE] shadow-[0_4px_12px_rgba(0,0,0,0.06)]' : ''
      }
      padding={14}
      tone={active ? 'default' : 'soft'}
    >
      <View style={styles.stepCardHeader}>
        <IconBubble
          backgroundColor={active ? PENCIL.accent : '#E5E7EB'}
          borderColor={active ? PENCIL.accentBorder : '#E5E7EB'}
          size={24}
        >
          <Text
            style={[
              styles.stepNumber,
              { color: active ? '#FFFFFF' : '#667085' },
            ]}
          >
            {number}
          </Text>
        </IconBubble>

        <View style={{ flex: 1 }}>
          <Text style={styles.stepTitle}>{title}</Text>
          <Text style={styles.stepDescription}>{description}</Text>
        </View>
      </View>

      <View style={{ marginTop: 10, gap: 10 }}>{children}</View>
    </SurfaceCard>
  );
}

export default function RecoveryScreen() {
  const { accentForeground } = useNativeButtonColors();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  return (
    <AppScreen contentTopPadding={12}>
      <View style={styles.hero}>
        <IconBubble
          backgroundColor="#EFF6FF"
          borderColor="#BFDBFE"
          size={64}
        >
          <KeyRound color={PENCIL.accent} size={30} strokeWidth={2.2} />
        </IconBubble>

        <View style={styles.heroCopy}>
          <Text style={styles.title}>Recuperar contraseña</Text>
          <Text style={styles.subtitle}>
            Completa los pasos para volver a entrar a AutoSense.
          </Text>
        </View>
      </View>

      <SurfaceCard tone="soft" padding={10} className="mt-4">
        <View style={styles.rail}>
          {[
            { key: '1', label: 'Correo', active: true },
            { key: '2', label: 'Código', active: false },
            { key: '3', label: 'Clave', active: false },
          ].map((step) => (
            <View
              key={step.key}
              style={[
                styles.railPill,
                step.active ? styles.railPillActive : styles.railPillInactive,
              ]}
            >
              <View
                style={[
                  styles.railDot,
                  step.active ? styles.railDotActive : styles.railDotInactive,
                ]}
              >
                {step.active ? (
                  <CircleCheck color="#FFFFFF" size={12} strokeWidth={2.5} />
                ) : null}
              </View>
              <Text
                style={[
                  styles.railLabel,
                  step.active ? styles.railLabelActive : styles.railLabelInactive,
                ]}
              >
                {step.label}
              </Text>
            </View>
          ))}
        </View>
      </SurfaceCard>

      <View style={{ gap: 10, marginTop: 12 }}>
        <RecoveryStepCard
          active
          description="Te enviaremos un código para validar tu cuenta."
          number={1}
          title="Correo"
        >
          <RecoveryField
            leftIcon={<Mail color={PENCIL.accent} size={17} strokeWidth={2.2} />}
            label="Correo electrónico"
            onChangeText={setEmail}
            placeholder="tu@correo.com"
            value={email}
          />
        </RecoveryStepCard>

        <RecoveryStepCard
          description="Ingresa el código de 6 dígitos."
          number={2}
          title="Código"
        >
          <RecoveryField
            leftIcon={<ShieldCheck color={PENCIL.success} size={17} strokeWidth={2.2} />}
            label="Código de verificación"
            onChangeText={setCode}
            placeholder="000000"
            value={code}
          />
        </RecoveryStepCard>

        <RecoveryStepCard
          description="Crea una nueva contraseña segura."
          number={3}
          title="Clave"
        >
          <RecoveryField
            leftIcon={<Lock color={PENCIL.warning} size={17} strokeWidth={2.2} />}
            label="Nueva contraseña"
            onChangeText={setPassword}
            onRightPress={() => setShowPassword((value) => !value)}
            placeholder="Nueva contraseña"
            rightIcon={
              showPassword ? (
                <EyeOff color="#98A2B3" size={18} strokeWidth={2} />
              ) : (
                <Eye color="#98A2B3" size={18} strokeWidth={2} />
              )
            }
            secureTextEntry={!showPassword}
            value={password}
          />
        </RecoveryStepCard>
      </View>

      <Button
        className="mt-4 w-full"
        onPress={() => {}}
        size="lg"
        variant="primary"
      >
        <Send color={accentForeground} size={17} strokeWidth={2.2} />
        <Button.Label>Enviar código</Button.Label>
      </Button>

      <View style={styles.switcher}>
        <Text style={styles.switcherMuted}>¿Recordaste tu contraseña?</Text>
        <LinkButton size="sm" onPress={() => {}}>
          <LinkButton.Label>Inicia sesión</LinkButton.Label>
        </LinkButton>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: 12,
  },
  heroCopy: {
    alignItems: 'center',
    gap: 6,
  },
  title: {
    color: PENCIL.text,
    fontSize: 27,
    lineHeight: 29,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: PENCIL.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    textAlign: 'center',
  },
  rail: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  railPill: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
  railPillActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#BFDBFE',
  },
  railPillInactive: {
    backgroundColor: '#F8FAFC',
    borderColor: '#F8FAFC',
  },
  railDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railDotActive: {
    backgroundColor: PENCIL.accent,
  },
  railDotInactive: {
    backgroundColor: '#E5E7EB',
  },
  railLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
  },
  railLabelActive: {
    color: PENCIL.text,
  },
  railLabelInactive: {
    color: PENCIL.muted,
  },
  stepCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  stepNumber: {
    fontSize: 11,
    fontWeight: '900',
  },
  stepTitle: {
    color: PENCIL.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
  },
  stepDescription: {
    color: PENCIL.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    marginTop: 2,
  },
  fieldGroup: {
    gap: 7,
  },
  switcher: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  switcherMuted: {
    color: PENCIL.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
});
