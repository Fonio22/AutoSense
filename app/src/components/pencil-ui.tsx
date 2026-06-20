import { type ReactNode } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Card, Chip, Avatar, useThemeColor } from "heroui-native";
import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

export const PENCIL = {
  accent: "#2563EB",
  accentSoft: "#EFF6FF",
  accentBorder: "#BFDBFE",
  success: "#137C6B",
  successSoft: "#F2F7F6",
  successBorder: "#DCEAE7",
  warning: "#EA580C",
  warningSoft: "#FFF7ED",
  warningBorder: "#FED7AA",
  danger: "#DC2626",
  dangerSoft: "#FEF2F2",
  dangerBorder: "#FECACA",
  text: "#111827",
  muted: "#667085",
  border: "#E5E7EB",
  surface: "#F8FAFC",
  surfaceAlt: "#F7F8FA",
  white: "#FFFFFF",
};

const ABSOLUTE_FILL = {
  bottom: 0,
  left: 0,
  position: "absolute" as const,
  right: 0,
  top: 0,
};

export function AppScreen({
  header,
  children,
  scroll = true,
  contentPaddingHorizontal = 16,
  contentTopPadding = 16,
  contentBottomPadding = 96,
}: {
  header?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  contentPaddingHorizontal?: number;
  contentTopPadding?: number;
  contentBottomPadding?: number;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      {header}
      {scroll ? (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: contentTopPadding,
              paddingBottom: insets.bottom + contentBottomPadding,
              paddingHorizontal: contentPaddingHorizontal,
            },
          ]}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.container}>{children}</View>
        </ScrollView>
      ) : (
        <View
          style={[
            styles.container,
            styles.containerFill,
            {
              paddingTop: contentTopPadding,
              paddingBottom: insets.bottom + contentBottomPadding,
              paddingHorizontal: contentPaddingHorizontal,
            },
          ]}
        >
          {children}
        </View>
      )}
    </View>
  );
}

export function useNativeButtonColors() {
  const [
    accent,
    accentForeground,
    success,
    successForeground,
    defaultForeground,
    warningForeground,
    dangerForeground,
  ] = useThemeColor([
    "accent",
    "accent-foreground",
    "success",
    "success-foreground",
    "default-foreground",
    "warning-foreground",
    "danger-foreground",
  ]);

  return {
    accent,
    accentForeground,
    defaultForeground,
    success,
    successForeground,
    warningForeground,
    dangerForeground,
  };
}

export function HeaderBackButton({
  onPress,
  accessibilityLabel = "Volver",
}: {
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const { defaultForeground } = useNativeButtonColors();
  const useGlassEffect = Platform.OS === "ios" && isGlassEffectAPIAvailable();

  return (
    <View style={styles.headerBackButtonWrap}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        hitSlop={10}
        onPress={onPress}
        style={({ pressed }) => [
          styles.headerBackButton,
          pressed ? styles.headerBackButtonPressed : null,
        ]}
      >
        {useGlassEffect ? (
          <GlassView
            colorScheme="light"
            tintColor="rgba(255, 255, 255, 0.34)"
            glassEffectStyle="regular"
            isInteractive={false}
            style={styles.headerBackButtonGlass}
          />
        ) : null}

        <View
          pointerEvents="none"
          style={
            useGlassEffect
              ? styles.headerBackButtonGlassChrome
              : styles.headerBackButtonFallback
          }
        />

        <ChevronLeft
          color={defaultForeground}
          size={18}
          strokeWidth={2.55}
          style={styles.headerBackButtonIcon}
        />
      </Pressable>
    </View>
  );
}

export function ScreenTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.pageHeaderCopy}>
        <Text style={styles.pageTitle}>{title}</Text>
        {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function DetailHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  right?: ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.detailHeader, { paddingTop: insets.top + 12 }]}>
      <View style={styles.detailHeaderRow}>
        <HeaderBackButton onPress={onBack} />

        <View style={{ flex: 1, gap: subtitle ? 3 : 0 }}>
          <Text style={styles.detailHeaderTitle}>{title}</Text>
          {subtitle ? (
            <Text style={styles.detailHeaderSubtitle}>{subtitle}</Text>
          ) : null}
        </View>

        {right ? <View style={styles.detailHeaderRight}>{right}</View> : null}
      </View>
    </View>
  );
}

export function SurfaceCard({
  children,
  padding = 14,
  tone = "default",
  className,
}: {
  children: ReactNode;
  padding?: number;
  tone?: "default" | "soft";
  className?: string;
}) {
  return (
    <Card
      className={["overflow-hidden p-0", className].filter(Boolean).join(" ")}
      style={[
        styles.surfaceCard,
        tone === "soft" ? styles.surfaceCardSoft : null,
      ]}
    >
      <Card.Body className="p-0">
        <View style={{ padding }}>{children}</View>
      </Card.Body>
    </Card>
  );
}

export function SectionTitle({
  title,
  caption,
  action,
}: {
  title: string;
  caption?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {caption ? <Text style={styles.sectionCaption}>{caption}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function IconBubble({
  children,
  backgroundColor,
  borderColor,
  size = 36,
}: {
  children: ReactNode;
  backgroundColor: string;
  borderColor?: string;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.iconBubble,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
          borderColor: borderColor ?? backgroundColor,
        },
      ]}
    >
      {children}
    </View>
  );
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  iconBackground,
  iconColor,
  onPress,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: ReactNode;
  iconBackground: string;
  iconColor: string;
  onPress?: () => void;
}) {
  const containerStyle = [
    "overflow-hidden rounded-[18px] border border-[#E5E7EB] shadow-none",
    onPress ? "active:opacity-90" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <Card className={containerStyle} animation="disable-all">
      <Card.Body className="p-0">
        <View style={styles.statCard}>
          <View style={styles.statCardTop}>
            <Text style={styles.statCardTitle}>{title}</Text>
            <IconBubble
              backgroundColor={iconBackground}
              borderColor={PENCIL.border}
              size={30}
            >
              {icon}
            </IconBubble>
          </View>

          <Text style={[styles.statCardValue, { color: iconColor }]}>
            {value}
          </Text>
          {subtitle ? (
            <Text style={styles.statCardSubtitle}>{subtitle}</Text>
          ) : null}
        </View>
      </Card.Body>
    </Card>
  );

  if (!onPress) {
    return content;
  }

  return <Pressable onPress={onPress}>{content}</Pressable>;
}

export function CompactMetricCard({
  title,
  value,
  subtitle,
  icon,
  iconBackground,
  iconColor,
  onPress,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: ReactNode;
  iconBackground: string;
  iconColor: string;
  onPress?: () => void;
}) {
  const content = (
    <View style={styles.compactMetricCard}>
      <View style={styles.compactMetricTop}>
        <Text style={styles.compactMetricTitle}>{title}</Text>
        <IconBubble
          backgroundColor={iconBackground}
          borderColor={PENCIL.border}
          size={30}
        >
          {icon}
        </IconBubble>
      </View>

      <Text style={[styles.compactMetricValue, { color: iconColor }]}>
        {value}
      </Text>
      {subtitle ? (
        <Text style={styles.compactMetricSubtitle}>{subtitle}</Text>
      ) : null}
    </View>
  );

  if (!onPress) {
    return <View style={styles.compactMetricWrap}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }: { pressed?: boolean }) => [
        styles.compactMetricWrap,
        pressed ? styles.compactMetricPressed : null,
      ]}
    >
      {content}
    </Pressable>
  );
}

export function MetricCard({
  title,
  value,
  unit,
  icon,
  iconBackground,
  iconColor,
  progress = 0,
  progressColor = PENCIL.accent,
}: {
  title: string;
  value: string;
  unit?: string;
  icon: ReactNode;
  iconBackground: string;
  iconColor: string;
  progress?: number;
  progressColor?: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricHeader}>
        <Text style={styles.metricTitle}>{title}</Text>
        <IconBubble
          backgroundColor={iconBackground}
          borderColor={PENCIL.border}
          size={34}
        >
          {icon}
        </IconBubble>
      </View>

      <View style={styles.metricValueRow}>
        <Text style={styles.metricValue}>{value}</Text>
        {unit ? <Text style={styles.metricUnit}>{unit}</Text> : null}
      </View>

      <View style={styles.metricTrack}>
        <View
          style={[
            styles.metricFill,
            {
              width: `${Math.max(0, Math.min(progress, 1)) * 100}%`,
              backgroundColor: progressColor,
            },
          ]}
        />
      </View>
    </View>
  );
}

export function ProgressBars({
  values,
  activeColor = PENCIL.success,
  inactiveColor = "#DCEAE7",
}: {
  values: number[];
  activeColor?: string;
  inactiveColor?: string;
}) {
  return (
    <View style={styles.progressRow}>
      {values.map((value, index) => (
        <View
          key={`${index}-${value}`}
          style={[
            styles.progressBar,
            { backgroundColor: value > 0 ? activeColor : inactiveColor },
          ]}
        />
      ))}
    </View>
  );
}

export function ListRow({
  icon,
  title,
  subtitle,
  value,
  valueColor = PENCIL.text,
  onPress,
  subtle = false,
  borderless = false,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  value?: string;
  valueColor?: string;
  onPress?: () => void;
  subtle?: boolean;
  borderless?: boolean;
}) {
  const rowStyle = [
    styles.listRow,
    subtle ? styles.listRowSubtle : styles.listRowDefault,
    borderless ? styles.listRowBorderless : null,
  ];

  const content = (
    <>
      <View style={styles.listRowLeading}>
        {icon}
        <View style={{ flex: 1 }}>
          <Text style={styles.listRowTitle}>{title}</Text>
          {subtitle ? (
            <Text style={styles.listRowSubtitle}>{subtitle}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.listRowTrailing}>
        {value ? (
          <Text style={[styles.listRowValue, { color: valueColor }]}>
            {value}
          </Text>
        ) : null}
        {onPress ? (
          <ChevronRight color={PENCIL.muted} size={18} strokeWidth={2} />
        ) : null}
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }: { pressed?: boolean }) => [
          ...rowStyle,
          pressed ? styles.listRowPressed : null,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={rowStyle}>{content}</View>;
}

export function ProfileAvatar({
  initials,
  label,
  subtitle,
  photoURL,
  borderless = false,
}: {
  initials: string;
  label: string;
  subtitle: string;
  photoURL?: string | null;
  borderless?: boolean;
}) {
  return (
    <View style={[styles.profileSummary, borderless ? styles.profileSummaryBorderless : null]}>
      <Avatar size="lg" color="accent" variant="soft">
        {photoURL ? <Avatar.Image source={{ uri: photoURL }} /> : null}
        <Avatar.Fallback>{initials}</Avatar.Fallback>
      </Avatar>
      <View style={styles.profileCopy}>
        <Text style={styles.profileName}>{label}</Text>
        <Text style={styles.profileSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.profileChipWrap}>
        <Chip variant="soft" color="accent" size="sm">
          <Chip.Label>Activo</Chip.Label>
        </Chip>
      </View>
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
  },
  containerFill: {
    flex: 1,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  pageHeaderCopy: {
    flex: 1,
    gap: 5,
  },
  pageTitle: {
    color: PENCIL.text,
    fontSize: 28,
    lineHeight: 31,
    fontWeight: "800",
  },
  pageSubtitle: {
    color: PENCIL.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: {
    color: PENCIL.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
  },
  sectionCaption: {
    color: PENCIL.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    marginTop: 2,
  },
  headerBackButtonWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    shadowColor: "#0F172A",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 7,
    },
    elevation: 3,
  },
  headerBackButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    overflow: "hidden",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  headerBackButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  headerBackButtonGlass: {
    ...ABSOLUTE_FILL,
    borderRadius: 21,
  },
  headerBackButtonGlassChrome: {
    ...ABSOLUTE_FILL,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.72)",
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
  headerBackButtonFallback: {
    ...ABSOLUTE_FILL,
    borderRadius: 21,
    backgroundColor: "rgba(248, 250, 252, 0.60)",
  },
  headerBackButtonIcon: {
    zIndex: 1,
  },
  detailHeader: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  detailHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  detailHeaderTitle: {
    color: PENCIL.text,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "800",
  },
  detailHeaderSubtitle: {
    color: PENCIL.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  detailHeaderRight: {
    alignItems: "flex-end",
  },
  detailHeaderBackGlyph: {
    color: PENCIL.text,
    fontSize: 23,
    lineHeight: 23,
    fontWeight: "400",
    marginTop: -1,
  },
  statCard: {
    padding: 12,
    gap: 8,
  },
  statCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  statCardTitle: {
    color: PENCIL.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    flex: 1,
  },
  statCardValue: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "800",
  },
  statCardSubtitle: {
    color: PENCIL.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
  },
  compactMetricCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: PENCIL.border,
    backgroundColor: "#FFFFFF",
    padding: 12,
    gap: 8,
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  compactMetricWrap: {
    flexBasis: "48%",
    flexGrow: 1,
    minWidth: 0,
  },
  compactMetricTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  compactMetricTitle: {
    color: PENCIL.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    flex: 1,
  },
  compactMetricValue: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "800",
  },
  compactMetricSubtitle: {
    color: PENCIL.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
  },
  compactMetricPressed: {
    opacity: 0.9,
  },
  iconBubble: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  metricCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: PENCIL.border,
    backgroundColor: "#FFFFFF",
    padding: 14,
    gap: 10,
    shadowColor: "#000000",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  metricHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  metricTitle: {
    color: PENCIL.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  metricValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  metricValue: {
    color: PENCIL.text,
    fontSize: 36,
    lineHeight: 38,
    fontWeight: "800",
  },
  metricUnit: {
    color: PENCIL.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  metricTrack: {
    height: 7,
    borderRadius: 9999,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },
  metricFill: {
    height: "100%",
    borderRadius: 9999,
  },
  progressRow: {
    flexDirection: "row",
    gap: 5,
  },
  progressBar: {
    flex: 1,
    height: 8,
    borderRadius: 9999,
  },
  listRow: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  listRowDefault: {
    backgroundColor: "#FFFFFF",
    borderColor: PENCIL.border,
  },
  listRowSubtle: {
    backgroundColor: PENCIL.surface,
    borderColor: PENCIL.border,
  },
  listRowBorderless: {
    backgroundColor: "#FFFFFF",
    borderWidth: 0,
  },
  listRowPressed: {
    opacity: 0.9,
  },
  listRowLeading: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  listRowTrailing: {
    maxWidth: "44%",
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    gap: 6,
    minWidth: 0,
  },
  listRowTitle: {
    color: PENCIL.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
  },
  listRowSubtitle: {
    color: PENCIL.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
    marginTop: 2,
  },
  listRowValue: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    flexShrink: 1,
    textAlign: "right",
  },
  profileSummary: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 18,
    backgroundColor: PENCIL.surfaceAlt,
    borderWidth: 1,
    borderColor: PENCIL.border,
    padding: 12,
  },
  profileSummaryBorderless: {
    backgroundColor: "#FFFFFF",
    borderWidth: 0,
  },
  profileCopy: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  profileChipWrap: {
    paddingTop: 2,
  },
  profileName: {
    color: PENCIL.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
  },
  profileSubtitle: {
    color: PENCIL.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    marginTop: 2,
  },
  surfaceCard: {
    backgroundColor: "#FFFFFF",
    borderCurve: "continuous",
    borderRadius: 24,
    boxShadow:
      "0 12px 28px rgba(15, 23, 42, 0.10), 0 2px 8px rgba(15, 23, 42, 0.06)",
  },
  surfaceCardSoft: {
    backgroundColor: PENCIL.surface,
    boxShadow: "0 8px 20px rgba(15, 23, 42, 0.06)",
  },
});
