import { Stack } from "expo-router";
import { CircleCheck, Sparkles } from "lucide-react-native";
import { type ReactNode } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import {
  HeaderBackButton,
  useNativeButtonColors,
} from "@/components/pencil-ui";
import { backOrFallback } from "@/lib/navigation";

const SUCCESS = "#137C6B";
const STEP_SURFACE = "#F7F8FA";
const STEP_BORDER = "#E5E7EB";
const MINT = "#F2F7F6";
const MINT_BORDER = "#DCEAE7";

export const unstable_settings = {
  initialRouteName: "index",
};

function RegisterHeader({
  stepLabel,
  stepTone = "accent",
  stepIcon,
}: {
  stepLabel: string;
  stepTone?: "accent" | "success";
  stepIcon: ReactNode;
}) {
  const textColor = stepTone === "success" ? SUCCESS : "#4B5563";
  const isIOS = Platform.OS === "ios";

  if (isIOS) {
    return (
      <View style={[styles.stepPillInner, styles.stepHeaderInline]}>
        {stepIcon}
        <Text style={[styles.stepHeaderText, { color: textColor }]}>
          {stepLabel}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.stepHeaderPill,
        stepTone === "success"
          ? styles.stepHeaderPillSuccess
          : styles.stepHeaderPillAccent,
      ]}
    >
      <View style={styles.stepPillInner}>
        {stepIcon}
        <Text style={[styles.stepPillText, { color: textColor }]}>
          {stepLabel}
        </Text>
      </View>
    </View>
  );
}

export default function RegisterLayout() {
  const { accent, success } = useNativeButtonColors();

  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: "#FFFFFF" },
        headerBackVisible: false,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: "#FFFFFF" },
        headerTitle: () => null,
        headerShown: Platform.OS !== "ios",
        title: "",
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerLeft:
            Platform.OS === "ios"
              ? undefined
              : () => <HeaderBackButton onPress={() => backOrFallback("/")} />,
          headerRight:
            Platform.OS === "ios"
              ? undefined
              : () => (
                  <RegisterHeader
                    stepIcon={
                      <Sparkles color={accent} size={14} strokeWidth={2.2} />
                    }
                    stepLabel="Paso 1 de 3"
                  />
                ),
        }}
      />
      <Stack.Screen
        name="data"
        options={{
          headerLeft:
            Platform.OS === "ios"
              ? undefined
              : () => (
                  <HeaderBackButton
                    onPress={() => backOrFallback("/register")}
                  />
                ),
          headerRight:
            Platform.OS === "ios"
              ? undefined
              : () => (
                  <RegisterHeader
                    stepIcon={
                      <Sparkles color={accent} size={14} strokeWidth={2.2} />
                    }
                    stepLabel="Paso 2 de 3"
                  />
                ),
        }}
      />
      <Stack.Screen
        name="password"
        options={{
          headerLeft:
            Platform.OS === "ios"
              ? undefined
              : () => (
                  <HeaderBackButton
                    onPress={() => backOrFallback("/register")}
                  />
                ),
          headerRight:
            Platform.OS === "ios"
              ? undefined
              : () => (
                  <RegisterHeader
                    stepIcon={
                      <CircleCheck
                        color={success}
                        size={14}
                        strokeWidth={2.2}
                      />
                    }
                    stepLabel="Paso 3 de 3"
                    stepTone="success"
                  />
                ),
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  stepHeaderPill: {
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  stepHeaderPillAccent: {
    backgroundColor: STEP_SURFACE,
    borderColor: STEP_BORDER,
  },
  stepHeaderPillSuccess: {
    backgroundColor: MINT,
    borderColor: MINT_BORDER,
  },
  stepPillInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stepHeaderInline: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  stepPillText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  stepHeaderText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
});
