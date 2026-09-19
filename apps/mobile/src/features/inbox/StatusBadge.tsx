import type { AssignmentStatus } from "@taskflow/shared";
import { StyleSheet, Text, View } from "react-native";
import { fontSize, radius, spacing, statusColors } from "../../ui/theme";
import { sentStatusLabel } from "./sentStatus";

/** Read-only assignment-status pill for the Sent list — text always accompanies color. */
export function StatusBadge({ status }: { status: AssignmentStatus }) {
  const { fg, bg } = statusColors[status];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]}>{sentStatusLabel(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  text: { fontSize: fontSize.tiny, fontWeight: "700" },
});
