import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { refreshSession } from "../src/api/client";
import { useSessionStore } from "../src/stores/sessionStore";

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <RootNavigator />
    </QueryClientProvider>
  );
}

function RootNavigator() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const isRestoring = useSessionStore((s) => s.isRestoring);
  const finishRestoring = useSessionStore((s) => s.finishRestoring);

  // On launch: try to trade a stored refresh token for a fresh session
  // before rendering any route, so the guard below sees the right state.
  useEffect(() => {
    refreshSession().finally(finishRestoring);
  }, [finishRestoring]);

  if (isRestoring) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  const isAuthenticated = accessToken !== null;

  return (
    <Stack>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="sign-in" options={{ title: "Sign In" }} />
        <Stack.Screen name="register" options={{ title: "Create Account" }} />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
