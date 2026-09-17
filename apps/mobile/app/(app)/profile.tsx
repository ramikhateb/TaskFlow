import { useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLogout, useMe } from "../../src/features/auth/useAuth";

export default function ProfileScreen() {
  const router = useRouter();
  const me = useMe();
  const logout = useLogout();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>

      {me.isLoading && <ActivityIndicator style={styles.spacer} />}

      {me.data && (
        <View style={styles.info}>
          <Text style={styles.label}>Name</Text>
          <Text style={styles.value}>{me.data.name}</Text>
          <Text style={styles.label}>Username</Text>
          <Text style={styles.value}>@{me.data.username}</Text>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{me.data.email}</Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.findPeopleButton}
        accessibilityRole="button"
        onPress={() => router.push("/search-users")}
      >
        <Text style={styles.findPeopleText}>Find People</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.signOutButton}
        accessibilityRole="button"
        disabled={logout.isPending}
        onPress={() => logout.mutate()}
      >
        {logout.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.signOutText}>Sign Out</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 24, gap: 16 },
  title: { fontSize: 28, fontWeight: "700" },
  spacer: { marginTop: 24 },
  info: { gap: 4, marginTop: 8 },
  label: { fontSize: 12, color: "#666", fontWeight: "600", marginTop: 12 },
  value: { fontSize: 16 },
  findPeopleButton: {
    backgroundColor: "#eef7ee",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 24,
  },
  findPeopleText: { color: "#1a7f37", fontSize: 16, fontWeight: "600" },
  signOutButton: {
    backgroundColor: "#c0392b",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 12,
  },
  signOutText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
