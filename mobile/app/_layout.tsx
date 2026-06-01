import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="chat/index" options={{ title: 'Messages', headerStyle: { backgroundColor: '#0A1128' }, headerTitleStyle: { color: '#C5A03B' }, headerTintColor: '#C5A03B' }} />
      <Stack.Screen name="chat/[id]" options={{ title: 'Chat', headerStyle: { backgroundColor: '#0A1128' }, headerTitleStyle: { color: '#C5A03B' }, headerTintColor: '#C5A03B' }} />
    </Stack>
  );
}
