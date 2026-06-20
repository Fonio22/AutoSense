import { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import {
  Button,
  InputGroup,
  Label,
  LinkButton,
  TextField,
} from "heroui-native";
import { Eye, EyeOff, Lock, LogIn, Mail, UserRound } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PENCIL, useNativeButtonColors } from "@/components/pencil-ui";
import {
  firebaseAuthErrorMessage,
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
  signInWithEmail,
  signInWithGoogleIdToken,
} from "@/lib/auth-client";

WebBrowser.maybeCompleteAuthSession();

const TEXT = "#111827";
const MUTED = "#667085";
const PLACEHOLDER = "#9CA3AF";

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accent, accentForeground } = useNativeButtonColors();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleRequest, googleResponse, promptGoogle] =
    Google.useIdTokenAuthRequest({
      androidClientId: GOOGLE_ANDROID_CLIENT_ID,
      iosClientId: GOOGLE_IOS_CLIENT_ID,
      webClientId: GOOGLE_WEB_CLIENT_ID,
      selectAccount: true,
    });

  useEffect(() => {
    if (googleResponse?.type !== "success") {
      return;
    }

    const authParams = (googleResponse as { params?: Record<string, string> }).params;
    let isActive = true;

    async function finishGoogleSignIn() {
      const idToken = authParams?.id_token;

      if (!idToken) {
        setErrorMessage("Google no devolvió un token válido.");
        return;
      }

      setIsSubmitting(true);

      try {
        await signInWithGoogleIdToken(idToken);
        router.replace("/home");
      } catch (error) {
        if (isActive) {
          setErrorMessage(firebaseAuthErrorMessage(error));
        }
      } finally {
        if (isActive) {
          setIsSubmitting(false);
        }
      }
    }

    void finishGoogleSignIn();

    return () => {
      isActive = false;
    };
  }, [googleResponse, router]);

  async function handleEmailSignIn() {
    if (isSubmitting) {
      return;
    }

    setErrorMessage("");
    setIsSubmitting(true);

    try {
      await signInWithEmail(email, password);
      router.replace("/home");
    } catch (error) {
      setErrorMessage(firebaseAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    if (isSubmitting || !googleRequest) {
      return;
    }

    setErrorMessage("");
    await promptGoogle();
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 24,
          },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <View style={styles.brandBlock}>
            <Image
              accessibilityIgnoresInvertColors
              resizeMode="contain"
              source={require("../../../assets/images/autosense-logo.png")}
              style={styles.logoImage}
            />

            <View style={styles.brandTextBlock}>
              <View style={styles.brandTitleRow}>
                <Text style={styles.brandTitle}>AutoSense</Text>
                <Text style={styles.brandAccent}> AI</Text>
              </View>
              <Text style={styles.subtitle}>
                Accede a tu cuenta y revisa el estado de tu vehículo.
              </Text>
            </View>
          </View>

          <View style={styles.formBlock}>
            <TextField style={styles.fieldGroup}>
              <Label className="text-[14px] font-bold text-[#111827]">
                Tu correo
              </Label>

              <InputGroup>
                <InputGroup.Prefix isDecorative>
                  <Mail color={PENCIL.accent} size={17} strokeWidth={2.2} />
                </InputGroup.Prefix>
                <InputGroup.Input
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  placeholder="tu@correo.com"
                  placeholderTextColor={PLACEHOLDER}
                  selectionColor={PENCIL.accent}
                  textContentType="emailAddress"
                  value={email}
                />
              </InputGroup>
            </TextField>

            <TextField style={styles.fieldGroup}>
              <Label className="text-[14px] font-bold text-[#111827]">
                Contraseña
              </Label>

              <InputGroup>
                <InputGroup.Prefix isDecorative>
                  <Lock color={PENCIL.accent} size={17} strokeWidth={2.2} />
                </InputGroup.Prefix>
                <InputGroup.Input
                  autoComplete="password"
                  onChangeText={setPassword}
                  placeholder="Contraseña"
                  placeholderTextColor={PLACEHOLDER}
                  selectionColor={PENCIL.accent}
                  secureTextEntry={!showPassword}
                  textContentType="password"
                  value={password}
                />
                <InputGroup.Suffix>
                  <Pressable
                    accessibilityLabel={
                      showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                    }
                    accessibilityRole="button"
                    hitSlop={10}
                    onPress={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? (
                      <EyeOff color={PLACEHOLDER} size={18} strokeWidth={2} />
                    ) : (
                      <Eye color={PLACEHOLDER} size={18} strokeWidth={2} />
                    )}
                  </Pressable>
                </InputGroup.Suffix>
              </InputGroup>
            </TextField>

            <View style={styles.rememberRow}>
              <LinkButton
                className="px-0"
                onPress={() => router.push("/recovery")}
                size="sm"
              >
                <LinkButton.Label
                  style={[styles.forgotPassword, { color: accent }]}
                >
                  ¿Olvidaste tu contraseña?
                </LinkButton.Label>
              </LinkButton>
            </View>
          </View>

          <View style={styles.actionsBlock}>
            {errorMessage ? (
              <Text accessibilityRole="alert" style={styles.errorText}>
                {errorMessage}
              </Text>
            ) : null}

            <Button
              className="w-full"
              isDisabled={isSubmitting}
              onPress={handleEmailSignIn}
              size="lg"
              variant="primary"
            >
              <LogIn color={accentForeground} size={17} strokeWidth={2.2} />
              <Button.Label>
                {isSubmitting ? "Entrando..." : "Iniciar sesión"}
              </Button.Label>
            </Button>

            <Button
              className="w-full"
              isDisabled={isSubmitting || !googleRequest}
              onPress={handleGoogleSignIn}
              size="lg"
              variant="outline"
            >
              <UserRound color={PENCIL.accent} size={17} strokeWidth={2.2} />
              <Button.Label>Continuar con Google</Button.Label>
            </Button>
          </View>

          <View style={styles.footerBlock}>
            <Text style={styles.footerPrompt}>¿No tienes cuenta?</Text>
            <LinkButton size="sm" onPress={() => router.push("/register")}>
              <LinkButton.Label style={styles.footerLink}>
                Crear cuenta
              </LinkButton.Label>
            </LinkButton>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    width: "100%",
    maxWidth: 390,
    alignSelf: "center",
    paddingHorizontal: 16,
  },
  brandBlock: {
    gap: 12,
    alignItems: "center",
    paddingVertical: 4,
  },
  logoImage: {
    width: 96,
    height: 96,
  },
  brandTextBlock: {
    width: "100%",
    gap: 7,
    alignItems: "center",
  },
  brandTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  brandTitle: {
    color: TEXT,
    fontSize: 30,
    lineHeight: 32,
    fontWeight: "800",
  },
  brandAccent: {
    color: PENCIL.accent,
    fontSize: 30,
    lineHeight: 32,
    fontWeight: "800",
    fontStyle: "italic",
  },
  subtitle: {
    width: "100%",
    color: MUTED,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    textAlign: "center",
  },
  formBlock: {
    gap: 12,
    marginTop: 19,
  },
  fieldGroup: {
    gap: 7,
  },
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
    paddingVertical: 12,
    marginTop: 2,
    marginBottom: 4,
  },
  actionsBlock: {
    gap: 13,
    marginTop: 12,
    alignItems: "center",
  },
  errorText: {
    width: "100%",
    color: "#B42318",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  forgotPassword: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  footerBlock: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  footerPrompt: {
    color: MUTED,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  footerLink: {
    color: PENCIL.accent,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
});
