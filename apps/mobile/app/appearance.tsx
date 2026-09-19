import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Screen } from "../src/ui/Screen";
import { ScreenHeader } from "../src/ui/ScreenHeader";
import { colors, fontSize, radius, spacing } from "../src/ui/theme";

/**
 * Nudge only has one visual theme today — there's no dark-mode/theming
 * system in the app (every screen reads fixed tokens from src/ui/theme.ts).
 * This shows that honestly (a selected "Light" row) instead of a toggle
 * that would have nothing real to switch.
 */
export default function AppearanceScreen() {
  return (
    <Screen>
      <ScreenHeader title="Appearance" />
      <View style={styles.content}>
        <Text style={styles.sectionLabel}>Theme</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="sunny-outline" size={20} color={colors.textPrimary} />
              <Text style={styles.rowLabel}>Light</Text>
            </View>
            <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
          </View>
        </View>
        <Text style={styles.hint}>
          Nudge currently only supports Light mode. More themes may come later.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.sm },
  sectionLabel: { fontSize: fontSize.meta, fontWeight: "700", color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rowLabel: { fontSize: fontSize.body, fontWeight: "600", color: colors.textPrimary },
  hint: { fontSize: fontSize.small, color: colors.textMuted, marginTop: spacing.xs },
});
