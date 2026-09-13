import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { useHealthCheck } from "../src/api/health";

export default function HomeScreen() {
  const { data, isLoading, isError, error } = useHealthCheck();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>TaskFlow</Text>
      <Text style={styles.label}>API connection</Text>

      {isLoading && <Text testID="api-status">Checking API connection…</Text>}

      {isError && (
        <Text testID="api-status" style={styles.error}>
          Could not reach API: {error instanceof Error ? error.message : "unknown error"}
        </Text>
      )}

      {data && (
        <Text testID="api-status" style={styles.success}>
          API status: {data.status} (shared package: {data.sharedPackage})
        </Text>
      )}

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
  label: {
    fontSize: 14,
    color: "#666",
  },
  success: {
    color: "#1a7f37",
  },
  error: {
    color: "#c0392b",
    textAlign: "center",
  },
});
