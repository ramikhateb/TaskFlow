import {
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/plus-jakarta-sans";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { refreshSession } from "../src/api/client";
import { useSessionStore } from "../src/stores/sessionStore";
import { colors } from "../src/ui/theme";

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());

  // Required for every `useSafeAreaInsets()`/`SafeAreaView` in the app (the
  // bottom tab bar, every screen's top inset via <Screen>) to read real
  // device measurements instead of silently falling back to zero — without
  // this provider at the true root, those insets are unreliable, which is
  // exactly why headers/back buttons were still colliding with the status
  // bar despite already being wrapped in <SafeAreaView>.
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <RootNavigator />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const isRestoring = useSessionStore((s) => s.isRestoring);
  const finishRestoring = useSessionStore((s) => s.finishRestoring);
  const [fontsLoaded] = useFonts({ PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold });

  // On launch: try to trade a stored refresh token for a fresh session
  // before rendering any route, so the guard below sees the right state.
  useEffect(() => {
    refreshSession().finally(finishRestoring);
  }, [finishRestoring]);

  if (isRestoring || !fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  const isAuthenticated = accessToken !== null;

  // No explicit `initialRouteName`: it applies to the whole <Stack> regardless
  // of which Stack.Protected branch is active, so "welcome" (only real when
  // logged out) would throw "couldn't find a screen named welcome" the moment
  // the authenticated branch was the active one. Ordering alone already makes
  // "welcome"/"(app)" the initial screen within each branch.
  //
  // Every screen reached by drilling into something from inside (app) —
  // task details/new/assign, an incoming request, editing your profile, ... —
  // is declared here as a plain sibling of "(app)", not nested inside its
  // Tabs navigator. That's deliberate: a screen nested inside a specific tab
  // (or, worse, sharing one hidden tab across all of them) only has a
  // sensible "back" target if it's reached from that one place. These are
  // reached identically from Today, Schedule, Tasks, Inbox, and Profile, so
  // they need one real, unbounded-depth stack sitting above the tab bar —
  // pushing from any tab adds to THIS stack, and Back always pops exactly
  // one real step (task → another task → back → back → whichever tab you
  // actually started from), the same way a plain iOS navigation stack works.
  return (
    <Stack>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
        <Stack.Screen name="tasks/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="tasks/new" options={{ headerShown: false }} />
        <Stack.Screen name="tasks/assign/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="inbox-detail/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="search-users" options={{ headerShown: false }} />
        <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="appearance" options={{ headerShown: false }} />
        <Stack.Screen name="help" options={{ headerShown: false }} />
        <Stack.Screen name="about" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
