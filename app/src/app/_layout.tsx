import '@/global.css';
import '@/lib/trip-tracking';

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import { Appearance, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HeroUINativeProvider } from 'heroui-native/provider';
import { Uniwind } from 'uniwind';

import { SessionProvider } from '@/components/providers/session-provider';

// ponytail: one global lock; remove only if user-selectable themes become real.
function lockLightTheme(updateSystemBackground = false) {
  Uniwind.setTheme('light');

  if (Platform.OS !== 'web' && Appearance.getColorScheme() !== 'light') {
    Appearance.setColorScheme('light');
  }

  if (updateSystemBackground) {
    void SystemUI.setBackgroundColorAsync('#FFFFFF').catch(() => undefined);
  }
}

lockLightTheme();

function LightThemeLock() {
  useEffect(() => {
    lockLightTheme(true);

    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      if (colorScheme !== 'light') {
        lockLightTheme(true);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SessionProvider>
          <HeroUINativeProvider>
            <LightThemeLock />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#FFFFFF' },
              }}
            />
          </HeroUINativeProvider>
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
