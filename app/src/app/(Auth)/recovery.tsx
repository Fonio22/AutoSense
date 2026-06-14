import { Stack } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import RecoveryScreen from "@/components/auth/recovery-screen";
import { HeaderBackButton } from "@/components/pencil-ui";
import { backOrFallback } from "@/lib/navigation";

export default function RecoveryRoute() {
  const isIOS = Platform.OS === "ios";

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: !isIOS,
          headerBackVisible: false,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: "#FFFFFF" },
          headerTitle: () => null,
          title: "",
          headerLeft: isIOS
            ? undefined
            : () => <HeaderBackButton onPress={() => backOrFallback("/")} />,
          headerRight: isIOS ? undefined : () => null,
          headerLeftContainerStyle: { paddingLeft: 16 },
        }}
      />
      {isIOS ? <RecoveryTopBar onBack={() => backOrFallback("/")} /> : null}
      <RecoveryScreen />
    </>
  );
}

function RecoveryTopBar({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
      <HeaderBackButton onPress={onBack} />
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    width: "100%",
    paddingHorizontal: 16,
    paddingBottom: 12,
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
});
