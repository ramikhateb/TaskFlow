import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Screen } from "../src/ui/Screen";
import { ScreenHeader } from "../src/ui/ScreenHeader";
import { colors, fontSize, radius, spacing } from "../src/ui/theme";

/**
 * Nudge has no push/email/SMS notifications in v1 by design (PRODUCT.md —
 * "in-app visibility via refetch-on-focus, no push") — there's nothing to
 * toggle. This screen says so plainly rather than showing switches that
 * would silently do nothing.
 */
export default function NotificationsScreen() {
  return (
    <Screen>
      <ScreenHeader title="Notifications" />
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="notifications-outline" size={26} color={colors.primary} />
        </View>
        <Text style={styles.title}>No push notifications yet</Text>
        <Text style={styles.body}>
          Nudge keeps things simple for now: your Inbox, Sent, and task lists refresh automatically
          whenever you open the app, so you always see the latest without needing push alerts.
        </Text>
        <View style={styles.card}>
          <Text style={styles.cardText}>
            When someone assigns you a task, it&apos;ll be waiting in your Inbox next time you check
            it — nothing is sent to your device in the background.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, alignItems: "center", gap: spacing.sm },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  title: { fontSize: fontSize.taskTitle, fontWeight: "700", color: colors.textPrimary },
  body: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 21,
  },
  card: {
    marginTop: spacing.md,
    width: "100%",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  cardText: { fontSize: fontSize.meta, color: colors.textSecondary, lineHeight: 19 },
});
