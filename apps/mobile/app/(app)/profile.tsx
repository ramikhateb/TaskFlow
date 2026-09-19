import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLogout, useMe } from "../../src/features/auth/useAuth";
import { useSentAssignments } from "../../src/features/inbox/useInbox";
import { useTasks } from "../../src/features/tasks/useTasks";
import { Avatar } from "../../src/ui/Avatar";
import { Screen } from "../../src/ui/Screen";
import { colors, fontFamily, fontSize, radius, spacing } from "../../src/ui/theme";

function Row({
  icon,
  label,
  subtitle,
  tone = "default",
  onPress,
  loading = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle: string;
  tone?: "default" | "danger";
  onPress: () => void;
  loading?: boolean;
}) {
  const color = tone === "danger" ? colors.danger : colors.textPrimary;
  return (
    <TouchableOpacity
      style={[styles.row, tone === "danger" && styles.rowNoBorder]}
      accessibilityRole="button"
      disabled={loading}
      onPress={onPress}
    >
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={20} color={color} />
        <View>
          <Text style={[styles.rowLabel, { color }]}>{label}</Text>
          <Text style={styles.rowSubtitle}>{subtitle}</Text>
        </View>
      </View>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      )}
    </TouchableOpacity>
  );
}

/** A single "24 Tasks"-style stat — `null` while its query hasn't resolved yet. */
function Stat({ count, label }: { count: number | null; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statCount}>{count === null ? "—" : count}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const me = useMe();
  const logout = useLogout();

  // Real counts, not placeholders: GET /tasks currently returns a user's
  // full matching set unfiltered (no server-side pagination exists yet — see
  // the M-Profile report), so a plain length here is honest today. The
  // all-tasks query shares its cache with anything else on this session that
  // already called useTasks({}) (e.g. the Tasks filter picker).
  const allTasks = useTasks({});
  const completedTasks = useTasks({ status: "DONE" });
  const sent = useSentAssignments();

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
          <Text style={styles.subtitle}>Manage your account and preferences.</Text>
        </View>

        {me.isLoading && <ActivityIndicator style={styles.spacer} color={colors.primary} />}

        {me.isError && (
          <Text style={styles.error}>
            Could not load your profile. Pull to refresh elsewhere and retry.
          </Text>
        )}

        {me.data && (
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.identityRow}
              accessibilityRole="button"
              accessibilityLabel="Edit profile"
              onPress={() => router.push("/edit-profile")}
            >
              <Avatar name={me.data.name} size={72} />
              <View style={styles.identityText}>
                <Text style={styles.name}>{me.data.name}</Text>
                <Text style={styles.username}>@{me.data.username}</Text>
                {me.data.bio && (
                  <Text style={styles.bio} numberOfLines={3}>
                    {me.data.bio}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={styles.statsRow}>
              <Stat count={allTasks.data?.length ?? null} label="Tasks" />
              <View style={styles.statDivider} />
              <Stat count={sent.data?.length ?? null} label="Sent" />
              <View style={styles.statDivider} />
              <Stat count={completedTasks.data?.length ?? null} label="Completed" />
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Row
            icon="people-outline"
            label="Find People"
            subtitle="Search for people to assign tasks to"
            onPress={() => router.push("/search-users")}
          />
        </View>

        <View style={styles.section}>
          <Row
            icon="notifications-outline"
            label="Notifications"
            subtitle="Manage your notifications"
            onPress={() => router.push("/notifications")}
          />
          <Row
            icon="color-palette-outline"
            label="Appearance"
            subtitle="Choose your theme"
            onPress={() => router.push("/appearance")}
          />
        </View>

        <View style={styles.section}>
          <Row
            icon="help-circle-outline"
            label="Help & Support"
            subtitle="Get help or contact us"
            onPress={() => router.push("/help")}
          />
          <Row
            icon="information-circle-outline"
            label="About Nudge"
            subtitle="Version and details"
            onPress={() => router.push("/about")}
          />
        </View>

        <View style={styles.dangerSection}>
          <Row
            icon="log-out-outline"
            label="Sign Out"
            subtitle="See you soon!"
            tone="danger"
            loading={logout.isPending}
            onPress={() => logout.mutate()}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, paddingBottom: spacing.xxl * 2 },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  title: {
    fontSize: fontSize.screenTitle,
    fontFamily: fontFamily.heading,
    color: colors.textPrimary,
  },
  subtitle: { fontSize: fontSize.meta, color: colors.textSecondary, marginTop: 2 },
  spacer: { marginTop: spacing.xl },
  error: { color: colors.danger, marginTop: spacing.lg, marginHorizontal: spacing.xl },
  card: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  identityRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  identityText: { flex: 1 },
  name: { fontSize: fontSize.sectionTitle, fontWeight: "700", color: colors.textPrimary },
  username: { fontSize: fontSize.body, color: colors.textSecondary, marginTop: 2 },
  bio: {
    fontSize: fontSize.meta,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: colors.border },
  statCount: { fontSize: fontSize.sectionTitle, fontWeight: "800", color: colors.textPrimary },
  statLabel: { fontSize: fontSize.small, color: colors.textSecondary },
  section: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  dangerSection: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowNoBorder: { borderBottomWidth: 0 },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 },
  rowLabel: { fontSize: fontSize.body, fontWeight: "600" },
  rowSubtitle: { fontSize: fontSize.small, color: colors.textMuted, marginTop: 1 },
});
