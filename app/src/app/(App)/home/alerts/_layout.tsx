import { Stack } from 'expo-router';

export default function HomeAlertsLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: '#FFFFFF' },
        headerShown: false,
      }}
    />
  );
}
