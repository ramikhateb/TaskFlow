import Constants from "expo-constants";
import { StyleSheet, Text, View } from "react-native";
import { Screen } from "../src/ui/Screen";
import { ScreenHeader } from "../src/ui/ScreenHeader";
import { colors, fontSize, radius, spacing } from "../src/ui/theme";

/** Real values only — the version comes from app.json via expo-constants, never a hardcoded string. */
export default function AboutScreen() {
  const version = Constants.expoConfig?.version ?? "—";

  return (
    <Screen>
      <ScreenHeader title="About Nudge" />
      <View style={styles.content}>
        <Text style={styles.wordmark}>Nudge</Text>
        <Text style={styles.tagline}>Small nudges. A more organized you.</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Version</Text>
            <Text style={styles.value}>{version}</Text>
          </View>
        </View>

        <Text style={styles.description}>
          Nudge helps you turn intentions into progress — a personal task manager where you can also
          hand off a task to someone else, who stays in control of when it lands on their own
          schedule.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.lg },
  wordmark: { fontSize: fontSize.screenTitle, fontWeight: "800", color: colors.textPrimary },
  tagline: { fontSize: fontSize.body, color: colors.textSecondary, marginTop: -spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md + 2,
  },
  label: { fontSize: fontSize.body, color: colors.textSecondary },
  value: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: "600" },
  description: { fontSize: fontSize.meta, color: colors.textSecondary, lineHeight: 20 },
});
