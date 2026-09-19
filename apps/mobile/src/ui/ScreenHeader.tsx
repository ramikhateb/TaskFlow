import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { IconButton } from "./IconButton";
import { colors, fontFamily, fontSize, spacing } from "./theme";

interface ScreenHeaderProps {
  title: string;
  action?: ReactNode;
}

/**
 * The compact "‹ Back   Title   [action]" row every pushed (non-tab) screen
 * uses in place of the native navigation header, so typography/spacing stay
 * consistent with the rest of the design system.
 */
export function ScreenHeader({ title, action }: ScreenHeaderProps) {
  const router = useRouter();
  return (
    <View style={styles.row}>
      <IconButton
        name="chevron-back"
        accessibilityLabel="Back"
        onPress={() => router.back()}
        style={styles.back}
      />
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.action}>{action}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  back: { marginRight: spacing.xs },
  title: {
    flex: 1,
    fontSize: fontSize.taskTitle,
    fontFamily: fontFamily.headingSemiBold,
    color: colors.textPrimary,
  },
  action: { minWidth: 40, alignItems: "flex-end" },
});
