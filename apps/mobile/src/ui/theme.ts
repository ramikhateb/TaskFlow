/**
 * M12 (Phase 2): shared design tokens. Every screen was independently
 * re-declaring the same handful of colors/radii/spacing values as inline
 * hex literals — this consolidates them so the app's look stays consistent
 * and a future palette tweak is a one-file change. Deliberately just a
 * plain constants module, not a theming library or provider: the app has
 * one visual identity, not switchable themes, so there's nothing a bigger
 * design-system package would buy here.
 */

export const colors = {
  // Brand / primary action.
  primary: "#1a7f37",
  primaryMuted: "#eef7ee",

  // Destructive / error.
  danger: "#c0392b",
  dangerMuted: "#fdecea",

  // Caution (e.g. a task frozen by a pending assignment).
  warning: "#8a6d00",
  warningMuted: "#fff8e1",

  // Informational / neutral notice (e.g. read-only creator view).
  info: "#3a4a5c",
  infoMuted: "#eef2f7",

  // Priority scale (also re-exported from PrioritySelector for back-compat).
  priorityLow: "#2e7d32",
  priorityMedium: "#b8860b",
  priorityHigh: "#c0392b",

  // Assignment status scale (Sent list).
  statusPending: "#b8860b",
  statusAccepted: "#1a7f37",
  statusDeclined: "#c0392b",
  statusCancelled: "#888888",

  // Structure.
  background: "#ffffff",
  border: "#cccccc",
  separator: "#eeeeee",

  // Text.
  textPrimary: "#1a1a1a",
  textBody: "#333333",
  textSubtle: "#444444",
  textMuted: "#666666",
  textFaint: "#999999",
  textOnPrimary: "#ffffff",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 16,
  pill: 999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 12,
  body: 13,
  base: 15,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;

/** Standard opacity applied to any disabled interactive control. */
export const disabledOpacity = 0.5;

/** Minimum comfortable touch target (Phase 13: accessibility/touch size). */
export const minTouchTarget = 44;
