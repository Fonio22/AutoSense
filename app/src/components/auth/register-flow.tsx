import { type ComponentProps, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Button, InputGroup, Label, TextField } from "heroui-native";
import {
  ArrowLeft,
  CircleCheck,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  PENCIL,
  useNativeButtonColors,
} from "@/components/pencil-ui";

const ACCENT = PENCIL.accent;
const SUCCESS = PENCIL.success;
const TEXT = PENCIL.text;
const MUTED = PENCIL.muted;
const PLACEHOLDER = "#9CA3AF";

const STEP_LABELS = ["Correo", "Datos", "Clave"] as const;

type RegisterScreenFrameProps = {
  heroIcon?: ReactNode;
  title: string;
  description: string;
  progress?: ReactNode;
  children: ReactNode;
  primaryLabel: string;
  primaryIcon: ReactNode;
  onPrimaryPress: () => void;
  onSecondaryPress?: () => void;
};

type RegisterFieldProps = Omit<
  ComponentProps<typeof InputGroup.Input>,
  "className" | "style"
> & {
  label: string;
  leftIcon: ReactNode;
  rightIcon?: ReactNode;
  onRightPress?: () => void;
};

export function RegisterScreenFrame({
  heroIcon,
  title,
  description,
  progress,
  children,
  primaryLabel,
  primaryIcon,
  onPrimaryPress,
  onSecondaryPress,
}: RegisterScreenFrameProps) {
  const insets = useSafeAreaInsets();
  const showFixedFooter = Platform.OS === "ios" && Boolean(onSecondaryPress);

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: 16,
            paddingBottom: insets.bottom + 24,
          },
        ]}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <View style={styles.contentBlock}>
            <View style={styles.heroBlock}>
              {heroIcon}

              <View style={styles.heroCopy}>
                <Text style={styles.heroTitle}>{title}</Text>
                <Text style={styles.heroDescription}>{description}</Text>
              </View>
            </View>

            {progress}

            <View style={styles.formBlock}>{children}</View>
          </View>
        </View>
      </ScrollView>

      {showFixedFooter ? (
        <View
          style={[
            styles.footerBlock,
            { paddingBottom: insets.bottom + 10 },
          ]}
        >
          <View style={styles.footerRow}>
            <Button
              accessibilityLabel="Atrás"
              className="flex-[0.9]"
              onPress={onSecondaryPress}
              size="md"
              variant="secondary"
            >
              <ArrowLeft size={16} strokeWidth={2.2} />
              <Button.Label>Atrás</Button.Label>
            </Button>

            <Button
              className="flex-[1.1]"
              onPress={onPrimaryPress}
              size="md"
              variant="primary"
            >
              {primaryIcon}
              <Button.Label>{primaryLabel}</Button.Label>
            </Button>
          </View>
        </View>
      ) : (
        <View style={styles.actionsBlock}>
          <Button
            className="w-full"
            onPress={onPrimaryPress}
            size="lg"
            variant="primary"
          >
            {primaryIcon}
            <Button.Label>{primaryLabel}</Button.Label>
          </Button>
        </View>
      )}
    </View>
  );
}

type RegisterToolbarProps = {
  onBack: () => void;
  stepLabel: string;
  stepTone?: "accent" | "success";
};

export function RegisterToolbar({
  onBack,
  stepLabel,
  stepTone = "accent",
}: RegisterToolbarProps) {
  const insets = useSafeAreaInsets();
  const { accent, success } = useNativeButtonColors();

  if (Platform.OS !== "ios") {
    return null;
  }

  const isSuccess = stepTone === "success";

  return (
    <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
      <View
        accessibilityLabel={stepLabel}
        style={[
          styles.stepPill,
          isSuccess ? styles.stepPillSuccess : styles.stepPillAccent,
        ]}
      >
        <View style={styles.stepPillInner}>
          {isSuccess ? (
            <CircleCheck color={success} size={14} strokeWidth={2.2} />
          ) : (
            <Sparkles color={accent} size={14} strokeWidth={2.2} />
          )}
          <Text
            style={[
              styles.stepPillText,
              { color: isSuccess ? SUCCESS : "#4B5563" },
            ]}
          >
            {stepLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function RegisterStepper({ step }: { step: 0 | 1 | 2 }) {
  if (Platform.OS === "ios") {
    return (
      <View style={styles.stepperGlassRow}>
        {STEP_LABELS.map((label, index) => {
          const isActive = index === step;
          const isComplete = index < step;

          return (
            <View
              key={label}
              style={[
                styles.stepperGlassItem,
                isComplete
                  ? styles.stepperGlassItemComplete
                  : isActive
                    ? styles.stepperGlassItemActive
                    : styles.stepperGlassItemInactive,
              ]}
            >
              <Text
                style={[
                  styles.stepperGlassNumber,
                  {
                    color: isComplete ? SUCCESS : isActive ? ACCENT : "#98A2B3",
                  },
                ]}
              >
                {index + 1}
              </Text>
              <Text
                style={[
                  styles.stepperGlassText,
                  {
                    color: isComplete ? SUCCESS : isActive ? ACCENT : "#98A2B3",
                  },
                ]}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.stepperRow}>
      {STEP_LABELS.map((label, index) => {
        const isActive = index === step;
        const isComplete = index < step;

        return (
          <View
            key={label}
            style={[
              styles.stepChip,
              isActive
                ? styles.stepChipActive
                : isComplete
                  ? styles.stepChipComplete
                  : styles.stepChipInactive,
            ]}
          >
            <Text
              style={[
                styles.stepChipNumber,
                {
                  color: isComplete ? "#FFFFFF" : isActive ? ACCENT : "#9CA3AF",
                },
              ]}
            >
              {index + 1}
            </Text>
            <Text
              style={[
                styles.stepChipText,
                {
                  color: isComplete ? "#FFFFFF" : isActive ? ACCENT : "#9CA3AF",
                },
              ]}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function RegisterField({
  label,
  leftIcon,
  rightIcon,
  onRightPress,
  ...inputProps
}: RegisterFieldProps) {
  return (
    <TextField style={styles.fieldGroup}>
      <Label className="text-[13px] font-extrabold text-[#111827]">
        {label}
      </Label>

      <InputGroup>
        <InputGroup.Prefix isDecorative>{leftIcon}</InputGroup.Prefix>
        <InputGroup.Input
          {...inputProps}
          placeholderTextColor={PLACEHOLDER}
          selectionColor={ACCENT}
        />

        {rightIcon ? (
          <InputGroup.Suffix>
            <Pressable
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

export function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <Eye color={PLACEHOLDER} size={18} strokeWidth={2} />
  ) : (
    <EyeOff color={PLACEHOLDER} size={18} strokeWidth={2} />
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
  contentBlock: {
    gap: 22,
  },
  heroBlock: {
    alignItems: "center",
    gap: 14,
  },
  heroCopy: {
    width: "100%",
    alignItems: "center",
    gap: 8,
  },
  heroTitle: {
    color: TEXT,
    fontSize: 27,
    lineHeight: 29,
    fontWeight: "800",
    textAlign: "center",
  },
  heroDescription: {
    color: MUTED,
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: "500",
    textAlign: "center",
  },
  formBlock: {
    gap: 12,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  stepperGlassRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  stepperGlassItem: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  stepperGlassItemActive: {
    backgroundColor: "rgba(239,246,255,0.96)",
    borderColor: PENCIL.accentBorder,
  },
  stepperGlassItemComplete: {
    backgroundColor: "rgba(214,249,243,0.95)",
    borderColor: "#BEE7DD",
  },
  stepperGlassItemInactive: {
    backgroundColor: "rgba(247,248,250,0.92)",
    borderColor: PENCIL.border,
  },
  stepperGlassNumber: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
    minWidth: 12,
    textAlign: "center",
  },
  stepperGlassText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  stepChip: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  stepChipActive: {
    borderColor: PENCIL.accentBorder,
    backgroundColor: PENCIL.accentSoft,
  },
  stepChipComplete: {
    borderColor: PENCIL.accent,
    backgroundColor: PENCIL.accent,
  },
  stepChipInactive: {
    borderColor: PENCIL.border,
    backgroundColor: PENCIL.surface,
  },
  stepChipNumber: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
    minWidth: 12,
    textAlign: "center",
  },
  stepChipText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  topBar: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  scrollView: {
    flex: 1,
  },
  stepPill: {
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  stepPillAccent: {
    backgroundColor: "#F7F8FA",
    borderColor: "#E5E7EB",
  },
  stepPillSuccess: {
    backgroundColor: "#F2F7F6",
    borderColor: "#DCEAE7",
  },
  stepPillInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stepPillText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  actionsBlock: {
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  footerBlock: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  fieldGroup: {
    gap: 7,
  },
});
