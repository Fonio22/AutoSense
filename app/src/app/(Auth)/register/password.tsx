import { useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { KeyRound, Lock, UserPlus } from "lucide-react-native";

import {
  PasswordVisibilityIcon,
  RegisterField,
  RegisterScreenFrame,
  RegisterToolbar,
  RegisterStepper,
} from "@/components/auth/register-flow";
import { useNativeButtonColors } from "@/components/pencil-ui";
import {
  firebaseAuthErrorMessage,
  registerWithEmail,
} from "@/lib/auth-client";
import { backOrFallback } from "@/lib/navigation";

const SUCCESS = "#137C6B";
const MINT = "#F2F7F6";
const MINT_BORDER = "#DCEAE7";

export default function RegisterPasswordScreen() {
  const { accentForeground } = useNativeButtonColors();
  const { email, fullName } = useLocalSearchParams<{
    email?: string;
    fullName?: string;
  }>();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleCreateAccount() {
    if (isSubmitting) {
      return;
    }

    if (!email) {
      setErrorMessage("Ingresa tu correo para crear la cuenta.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Las contraseñas no coinciden.");
      return;
    }

    setErrorMessage("");
    setIsSubmitting(true);

    try {
      await registerWithEmail(email, password, fullName);
      router.replace("/home");
    } catch (error) {
      setErrorMessage(firebaseAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <RegisterToolbar
        onBack={() => backOrFallback("/register")}
        stepLabel="Paso 3 de 3"
        stepTone="success"
      />
      <RegisterScreenFrame
        description="Protege tu cuenta para acceder a las lecturas del vehículo."
        heroIcon={
          <View
            style={{
              width: 76,
              height: 76,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: MINT_BORDER,
              backgroundColor: MINT,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <KeyRound color={SUCCESS} size={34} strokeWidth={2.25} />
          </View>
        }
        onSecondaryPress={() => backOrFallback("/register")}
        onPrimaryPress={handleCreateAccount}
        primaryIcon={
          <UserPlus color={accentForeground} size={18} strokeWidth={2.2} />
        }
        primaryLabel={isSubmitting ? "Creando..." : "Crear cuenta"}
        progress={<RegisterStepper step={2} />}
        title="Crea tu contraseña"
      >
        <RegisterField
          autoComplete="new-password"
          label="Contraseña nueva"
          leftIcon={<Lock color={SUCCESS} size={17} strokeWidth={2.2} />}
          onChangeText={setPassword}
          onRightPress={() => setShowPassword((value) => !value)}
          placeholder="Contraseña nueva"
          rightIcon={<PasswordVisibilityIcon visible={showPassword} />}
          secureTextEntry={!showPassword}
          textContentType="newPassword"
          value={password}
        />

        <RegisterField
          autoComplete="new-password"
          label="Confirmar contraseña"
          leftIcon={<Lock color={SUCCESS} size={17} strokeWidth={2.2} />}
          onChangeText={setConfirmPassword}
          onRightPress={() => setShowConfirmPassword((value) => !value)}
          placeholder="Confirmar contraseña"
          rightIcon={<PasswordVisibilityIcon visible={showConfirmPassword} />}
          secureTextEntry={!showConfirmPassword}
          textContentType="newPassword"
          value={confirmPassword}
        />

        {errorMessage ? (
          <Text
            accessibilityRole="alert"
            style={{
              color: "#B42318",
              fontSize: 13,
              fontWeight: "700",
              lineHeight: 18,
              textAlign: "center",
            }}
          >
            {errorMessage}
          </Text>
        ) : null}
      </RegisterScreenFrame>
    </>
  );
}
