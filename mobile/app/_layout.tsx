import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="chat/index" options={{ title: 'Messages', headerStyle: { backgroundColor: '#0B0A10' }, headerTitleStyle: { color: '#D4AF37' }, headerTintColor: '#D4AF37' }} />
      <Stack.Screen name="chat/[id]" options={{ title: 'Chat', headerStyle: { backgroundColor: '#0B0A10' }, headerTitleStyle: { color: '#D4AF37' }, headerTintColor: '#D4AF37' }} />
    </Stack>
  );
}
