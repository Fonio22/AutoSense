import { Stack } from 'expo-router';

export default function HomeLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: '#FFFFFF' },
        headerShown: false,
      }}
    />
  );
}
