import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="chat/index"
          options={{
            title: "IQChat",
            headerStyle: { backgroundColor: "#0A1128" },
            headerTitleStyle: { color: "#C5A03B", fontWeight: "700" },
            headerTintColor: "#C5A03B",
          }}
        />
        <Stack.Screen
          name="chat/[id]"
          options={{
            title: "Discussion",
            headerStyle: { backgroundColor: "#0A1128" },
            headerTitleStyle: { color: "#C5A03B" },
            headerTintColor: "#C5A03B",
          }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
