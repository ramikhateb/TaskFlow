import { useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLogout, useMe } from "../../src/features/auth/useAuth";
import { colors, fontSize, radius, spacing } from "../../src/ui/theme";

export default function ProfileScreen() {
  const router = useRouter();
  const me = useMe();
  const logout = useLogout();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>

      {me.isLoading && <ActivityIndicator style={styles.spacer} />}

      {me.isError && (
        <Text style={styles.error}>Could not load your profile. Pull down elsewhere to retry.</Text>
      )}

      {me.data && (
        <View style={styles.identityCard}>
          <Text style={styles.name}>{me.data.name}</Text>
          <Text style={styles.username}>@{me.data.username}</Text>

          <View style={styles.divider} />

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
          <ActivityIndicator color={colors.textOnPrimary} />
        ) : (
          <Text style={styles.signOutText}>Sign Out</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, gap: spacing.lg },
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.textPrimary },
  spacer: { marginTop: spacing.xl },
  error: { color: colors.danger, marginTop: spacing.md },
  identityCard: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  name: { fontSize: fontSize.xl, fontWeight: "700", color: colors.textPrimary },
  username: { fontSize: fontSize.base, color: colors.primary, fontWeight: "600", marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.separator, marginVertical: spacing.md },
  label: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: "600" },
  value: { fontSize: fontSize.md, color: colors.textPrimary, marginTop: 2 },
  findPeopleButton: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.md,
    padding: 14,
    alignItems: "center",
    marginTop: spacing.xl,
  },
  findPeopleText: { color: colors.primary, fontSize: fontSize.md, fontWeight: "600" },
  signOutButton: {
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    padding: 14,
    alignItems: "center",
    marginTop: spacing.md,
  },
  signOutText: { color: colors.textOnPrimary, fontSize: fontSize.md, fontWeight: "600" },
});
