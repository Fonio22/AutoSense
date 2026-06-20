import { useState } from "react";
import { Image } from "react-native";
import { router } from "expo-router";
import { ArrowRight, Mail } from "lucide-react-native";

import {
  RegisterField,
  RegisterScreenFrame,
  RegisterToolbar,
  RegisterStepper,
} from "@/components/auth/register-flow";
import { useNativeButtonColors } from "@/components/pencil-ui";
import { backOrFallback } from "@/lib/navigation";

export default function RegisterEmailScreen() {
  const { accent, accentForeground } = useNativeButtonColors();
  const [email, setEmail] = useState("");

  return (
    <>
      <RegisterToolbar
        onBack={() => backOrFallback("/")}
        stepLabel="Paso 1 de 3"
      />
      <RegisterScreenFrame
        description="Ingresa el correo que usarás para recibir alertas, reportes y acceso seguro a tu vehículo."
        heroIcon={
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="contain"
            source={require("../../../../assets/images/autosense-logo.png")}
            style={{ width: 86, height: 86 }}
          />
        }
        onSecondaryPress={() => backOrFallback("/")}
        onPrimaryPress={() =>
          router.push({
            pathname: "/register/data",
            params: { email: email.trim() },
          })
        }
        primaryIcon={
          <ArrowRight color={accentForeground} size={18} strokeWidth={2.2} />
        }
        primaryLabel="Continuar"
        progress={<RegisterStepper step={0} />}
        title="Crea tu cuenta AutoSense AI"
      >
        <RegisterField
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          label="Correo electrónico"
          leftIcon={<Mail color={accent} size={17} strokeWidth={2.2} />}
          onChangeText={setEmail}
          placeholder="tu@correo.com"
          textContentType="emailAddress"
          value={email}
        />
      </RegisterScreenFrame>
    </>
  );
}
