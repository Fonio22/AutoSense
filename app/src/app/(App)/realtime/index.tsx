import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { Button } from 'heroui-native';
import {
  Bluetooth,
  CircleCheck,
  RefreshCcw,
  Sparkles,
  Zap,
} from 'lucide-react-native';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  runOnUI,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useSession } from '@/components/providers/session-provider';
import { AppScreen, PENCIL } from '@/components/pencil-ui';
import { setRealtimeConnectionState } from '@/lib/autosense-data';

const ABSOLUTE_FILL = {
  bottom: 0,
  left: 0,
  position: 'absolute' as const,
  right: 0,
  top: 0,
};

export default function RealtimePairScreen() {
  const useGlassEffect = isGlassEffectAPIAvailable();
  const { firebaseUser, profile } = useSession();
  const pulse = useSharedValue(0);
  const drift = useSharedValue(0);
  const spin = useSharedValue(0);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, {
        duration: 2400,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );

    drift.value = withRepeat(
      withTiming(1, {
        duration: 3200,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, [drift, pulse]);

  const outerHaloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.15, 0.35]),
    transform: [
      {
        scale: interpolate(pulse.value, [0, 1], [0.92, 1.12]),
      },
    ],
  }));

  const innerHaloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.28, 0.08]),
    transform: [
      {
        scale: interpolate(pulse.value, [0, 1], [0.84, 1.02]),
      },
    ],
  }));

  const orbStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(drift.value, [0, 1], [0, -8]),
      },
      {
        scale: interpolate(pulse.value, [0, 1], [1, 1.04]),
      },
    ],
  }));

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.78, 1]),
    transform: [
      {
        translateX: interpolate(drift.value, [0, 1], [0, 8]),
      },
      {
        translateY: interpolate(pulse.value, [0, 1], [0, -3]),
      },
    ],
  }));

  const refreshIconStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: `${interpolate(spin.value, [0, 1], [0, 360])}deg`,
      },
    ],
  }));

  const handleRefresh = () => {
    runOnUI(() => {
      'worklet';
      spin.value = 0;
      spin.value = withTiming(1, {
        duration: 700,
        easing: Easing.linear,
      });
    })();
  };

  async function handleConnect() {
    if (!firebaseUser?.uid || isConnecting) {
      router.push('/realtime/live');
      return;
    }

    setIsConnecting(true);

    try {
      await setRealtimeConnectionState(firebaseUser.uid, true);
      router.push('/realtime/live');
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <AppScreen contentPaddingHorizontal={16} contentTopPadding={12}>
      <View style={styles.page}>
        <View style={styles.header}>
          <View style={styles.eyebrow}>
            <Text style={styles.eyebrowText}>OBD2</Text>
          </View>

          <Text style={styles.title}>Conecta tu OBD2</Text>
          <Text style={styles.subtitle}>
            Emparejamiento rápido para abrir datos en vivo.
          </Text>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroBody}>
            <View style={styles.heroTopRow}>
              <View style={styles.statusPill}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>
                  {profile?.realtime?.statusLabel ?? 'Listo para emparejar'}
                </Text>
              </View>

              <Button
                accessibilityLabel="Volver a escanear"
                isIconOnly
                onPress={handleRefresh}
                size="sm"
                style={styles.iconButton}
                variant="ghost"
              >
                <Animated.View style={refreshIconStyle}>
                  <RefreshCcw color={PENCIL.accent} size={16} strokeWidth={2.1} />
                </Animated.View>
              </Button>
            </View>

            <View style={styles.visualStage}>
              <Animated.View style={[styles.outerHalo, outerHaloStyle]} />
              <Animated.View style={[styles.innerHalo, innerHaloStyle]} />
              <Animated.View style={[styles.coreOrb, orbStyle]}>
                {useGlassEffect ? (
                  <GlassView
                    colorScheme="light"
                    glassEffectStyle="regular"
                    isInteractive={false}
                    style={styles.coreGlass}
                    tintColor="rgba(37, 99, 235, 0.12)"
                  />
                ) : (
                  <View style={styles.coreFallback} />
                )}

                <Bluetooth color={PENCIL.accent} size={30} strokeWidth={2.1} />
              </Animated.View>

              <Animated.View style={[styles.floatingBadge, badgeStyle]}>
                <Sparkles color={PENCIL.accent} size={14} strokeWidth={2.2} />
              </Animated.View>
            </View>

            <View style={styles.chipRow}>
              <View style={styles.chip}>
                <CircleCheck color="#4ADE80" size={14} strokeWidth={2.2} />
                <Text style={styles.chipText}>
                  {profile?.realtime?.signalLabel ?? 'Señal estable'}
                </Text>
              </View>

              <View style={styles.chip}>
                <Zap color="#93C5FD" size={14} strokeWidth={2.2} />
                <Text style={styles.chipText}>Rápido</Text>
              </View>

              <View style={styles.chip}>
                <Bluetooth color="#C4B5FD" size={14} strokeWidth={2.2} />
                <Text style={styles.chipText}>
                  {profile?.realtime?.deviceLabel ?? 'Listo'}
                </Text>
              </View>
            </View>

            <Button
              className="w-full"
              onPress={() => {
                void handleConnect();
              }}
              size="lg"
              variant="primary"
            >
              <Button.Label>
                {isConnecting ? 'Conectando...' : 'Conectar ahora'}
              </Button.Label>
            </Button>
          </View>
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: 16,
  },
  header: {
    gap: 6,
    paddingHorizontal: 2,
  },
  eyebrow: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D6E4FF',
    backgroundColor: '#EFF6FF',
  },
  eyebrowText: {
    color: PENCIL.accent,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  title: {
    color: PENCIL.text,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  subtitle: {
    color: PENCIL.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    maxWidth: 290,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderCurve: 'continuous',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    boxShadow:
      '0 20px 56px rgba(15, 23, 42, 0.10), 0 1px 0 rgba(255, 255, 255, 0.85) inset',
  },
  heroBody: {
    gap: 18,
    padding: 16,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#4ADE80',
  },
  statusText: {
    color: PENCIL.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#EFF6FF',
  },
  visualStage: {
    height: 252,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerHalo: {
    position: 'absolute',
    width: 194,
    height: 194,
    borderRadius: 97,
    backgroundColor: 'rgba(37, 99, 235, 0.10)',
  },
  innerHalo: {
    position: 'absolute',
    width: 142,
    height: 142,
    borderRadius: 71,
    backgroundColor: 'rgba(20, 184, 166, 0.10)',
  },
  coreOrb: {
    width: 108,
    height: 108,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coreGlass: {
    ...ABSOLUTE_FILL,
    borderRadius: 36,
  },
  coreFallback: {
    ...ABSOLUTE_FILL,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  floatingBadge: {
    position: 'absolute',
    top: 30,
    right: 32,
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
  },
  chipText: {
    color: PENCIL.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
});
