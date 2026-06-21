import { router } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { getActiveObdConnection } from '@/lib/obd/obd-device';

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor="#FFFFFF"
      indicatorColor="#E5E7EB"
      iconColor={{ default: '#9CA3AF', selected: '#2563EB' }}
      screenListeners={({ route }) => ({
        tabPress: () => {
          if (route.name === 'trips') {
            router.dismissTo('/trips');
            return;
          }

          if (route.name === 'realtime') {
            router.dismissTo(getActiveObdConnection() ? '/realtime/live' : '/realtime');
          }
        },
      })}
      labelStyle={{
        default: { color: '#667085', fontSize: 10, fontWeight: '600' },
        selected: { color: '#2563EB', fontSize: 10, fontWeight: '700' },
      }}
    >
      <NativeTabs.Trigger name="home">
        <NativeTabs.Trigger.Label>Inicio</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md="home"
          sf={Platform.OS === 'ios' ? 'house' : undefined}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="realtime">
        <NativeTabs.Trigger.Label>Tiempo real</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md="dashboard"
          sf={Platform.OS === 'ios' ? 'gauge' : undefined}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="trips">
        <NativeTabs.Trigger.Label>Maps</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md="map"
          sf={Platform.OS === 'ios' ? 'map' : undefined}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Perfil</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md="person"
          sf={Platform.OS === 'ios' ? 'person' : undefined}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
