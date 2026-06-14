import { Stack } from 'expo-router';

export default function TripsLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: '#FFFFFF' },
        headerShown: false,
      }}
    />
  );
}
