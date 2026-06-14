import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import {
  ArrowRight,
  CalendarDays,
  IdCard,
  Phone,
  UserRound,
} from "lucide-react-native";

import {
  RegisterField,
  RegisterScreenFrame,
  RegisterToolbar,
  RegisterStepper,
} from "@/components/auth/register-flow";
import { PENCIL, useNativeButtonColors } from "@/components/pencil-ui";
import { backOrFallback } from "@/lib/navigation";

export default function RegisterDataScreen() {
  const { accent, accentForeground } = useNativeButtonColors();
  const [fullName, setFullName] = useState("");
  const [personalId, setPersonalId] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");

  return (
    <>
      <RegisterToolbar
        onBack={() => backOrFallback("/register")}
        stepLabel="Paso 2 de 3"
      />
      <RegisterScreenFrame
        description="Usaremos estos datos para personalizar tu cuenta de AutoSense AI y ajustar las recomendaciones."
        heroIcon={
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: PENCIL.accentBorder,
              backgroundColor: PENCIL.accentSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <UserRound color={accent} size={30} strokeWidth={2.2} />
          </View>
        }
        onSecondaryPress={() => backOrFallback("/register")}
        onPrimaryPress={() => router.push("/register/password")}
        primaryIcon={
          <ArrowRight color={accentForeground} size={18} strokeWidth={2.2} />
        }
        primaryLabel="Continuar"
        progress={<RegisterStepper step={1} />}
        title="Cuéntanos sobre ti"
      >
        <RegisterField
          autoCapitalize="words"
          autoComplete="name"
          autoCorrect={false}
          label="Nombre completo"
          leftIcon={<UserRound color={accent} size={17} strokeWidth={2.2} />}
          onChangeText={setFullName}
          placeholder="Tu nombre completo"
          textContentType="name"
          value={fullName}
        />

        <RegisterField
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect={false}
          label="Identificación"
          leftIcon={<IdCard color={accent} size={17} strokeWidth={2.2} />}
          onChangeText={setPersonalId}
          placeholder="Número de identificación"
          value={personalId}
        />

        <RegisterField
          autoCapitalize="none"
          autoComplete="tel"
          autoCorrect={false}
          keyboardType="phone-pad"
          label="Teléfono"
          leftIcon={<Phone color={accent} size={17} strokeWidth={2.2} />}
          onChangeText={setPhone}
          placeholder="tu celular"
          textContentType="telephoneNumber"
          value={phone}
        />

        <RegisterField
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect={false}
          label="Fecha de nacimiento"
          leftIcon={<CalendarDays color={accent} size={17} strokeWidth={2.2} />}
          onChangeText={setBirthDate}
          placeholder="DD/MM/AAAA"
          value={birthDate}
        />
      </RegisterScreenFrame>
    </>
  );
}
