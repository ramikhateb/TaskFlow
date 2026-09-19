import type { ReactNode } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, disabledOpacity, fontSize, radius, spacing } from "./theme";

export type ButtonVariant =
  "primary" | "secondary" | "outline" | "outlinePrimary" | "danger" | "ghost";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * One flexible button covering the redesign's "PrimaryButton"/"SecondaryButton"
 * roles via a `variant` prop, rather than several near-identical components.
 * `outline` is the deliberately calm choice for a non-destructive negative
 * action (e.g. Decline) — never styled as loud as `danger`.
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  icon,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const variantStyle = variantStyles[variant];

  return (
    <TouchableOpacity
      style={[styles.base, variantStyle.container, isDisabled && styles.disabled, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={variantStyle.text.color as string} />
      ) : (
        <>
          {icon}
          <Text style={[styles.label, variantStyle.text]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    minHeight: 50,
  },
  label: { fontSize: fontSize.body, fontWeight: "600" },
  disabled: { opacity: disabledOpacity },
});

const variantStyles: Record<ButtonVariant, { container: ViewStyle; text: { color: string } }> = {
  primary: {
    container: { backgroundColor: colors.primary },
    text: { color: colors.textOnPrimary },
  },
  secondary: {
    container: { backgroundColor: colors.primaryLight },
    text: { color: colors.primaryPressed },
  },
  outline: {
    container: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    text: { color: colors.textPrimary },
  },
  outlinePrimary: {
    container: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
    text: { color: colors.primary },
  },
  danger: {
    container: { backgroundColor: colors.dangerBg },
    text: { color: colors.danger },
  },
  ghost: {
    container: { backgroundColor: "transparent" },
    text: { color: colors.primary },
  },
};
