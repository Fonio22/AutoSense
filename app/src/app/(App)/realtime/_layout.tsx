import { Stack } from 'expo-router';

export default function RealtimeLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: '#FFFFFF' },
        headerShown: false,
      }}
    />
  );
}
