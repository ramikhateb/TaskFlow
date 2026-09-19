import type { TaskPriority } from "@taskflow/shared";
import { StyleSheet, Text, View } from "react-native";
import { fontSize, priorityColors, radius, spacing } from "../../ui/theme";
import { priorityLabel } from "./PrioritySelector";

/** Read-only soft-filled priority pill — HIGH → soft red, MEDIUM → soft amber, LOW → soft green. */
export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const { fg, bg } = priorityColors[priority];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]}>{priorityLabel(priority)}</Text>
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
