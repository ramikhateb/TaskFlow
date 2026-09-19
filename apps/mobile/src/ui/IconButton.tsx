import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from "react-native";
import { colors, disabledOpacity, radius, shadow } from "./theme";

interface IconButtonProps {
  name: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  variant?: "default" | "primary" | "floating";
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * A round icon-only tap target. `floating` is the one place in the app that
 * uses a shadow (the create-task FAB) — every other surface stays flat.
 */
export function IconButton({
  name,
  onPress,
  accessibilityLabel,
  variant = "default",
  size = 22,
  disabled = false,
  style,
}: IconButtonProps) {
  const isFloating = variant === "floating";
  const isPrimary = variant === "primary" || isFloating;

  return (
    <TouchableOpacity
      style={[
        styles.base,
        variant === "default" && styles.default,
        isFloating && styles.floating,
        isPrimary && styles.primary,
        disabled && styles.disabled,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Ionicons
        name={name}
        size={size}
        color={isPrimary ? colors.textOnPrimary : colors.textSecondary}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  default: { backgroundColor: colors.neutral },
  primary: { backgroundColor: colors.primary },
  floating: {
    width: 56,
    height: 56,
    ...shadow,
  },
  disabled: { opacity: disabledOpacity },
});
