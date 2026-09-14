import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useHealthCheck } from "../../src/api/health";
import { useLogout, useMe } from "../../src/features/auth/useAuth";

export default function HomeScreen() {
  const me = useMe();
  const health = useHealthCheck();
  const logout = useLogout();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>TaskFlow</Text>

      {me.isLoading && <ActivityIndicator />}
      {me.data && (
        <Text style={styles.profile}>
          Signed in as {me.data.name} ({me.data.email})
        </Text>
      )}

      <Text style={styles.label}>API connection</Text>
      {health.isLoading && <Text testID="api-status">Checking API connection…</Text>}
      {health.isError && (
        <Text testID="api-status" style={styles.error}>
          Could not reach API:{" "}
          {health.error instanceof Error ? health.error.message : "unknown error"}
        </Text>
      )}
      {health.data && (
        <Text testID="api-status" style={styles.success}>
          API status: {health.data.status} (shared package: {health.data.sharedPackage})
        </Text>
      )}

      <TouchableOpacity
        style={styles.button}
        accessibilityRole="button"
        disabled={logout.isPending}
        onPress={() => logout.mutate()}
      >
        {logout.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign Out</Text>
        )}
      </TouchableOpacity>

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
  },
  profile: {
    fontSize: 15,
    color: "#333",
  },
  label: {
    fontSize: 14,
    color: "#666",
    marginTop: 16,
  },
  success: {
    color: "#1a7f37",
  },
  error: {
    color: "#c0392b",
    textAlign: "center",
  },
  button: {
    backgroundColor: "#c0392b",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    marginTop: 24,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
