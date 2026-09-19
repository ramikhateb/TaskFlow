import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fontSize, spacing } from "./theme";

interface SectionHeaderProps {
  title: string;
  count?: number;
  action?: ReactNode;
  tone?: "default" | "danger";
}

/** A small caption-style header above a group of cards, e.g. "Overdue · 3". */
export function SectionHeader({ title, count, action, tone = "default" }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text style={[styles.title, tone === "danger" && styles.titleDanger]}>
        {title}
        {count !== undefined ? ` · ${count}` : ""}
      </Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.sectionTitle,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  titleDanger: { color: colors.danger },
});
