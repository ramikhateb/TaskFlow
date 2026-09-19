/**
 * Nudge design tokens (visual redesign, formerly the M12 TaskFlow palette).
 * A plain constants module, not a theming library — the app has one visual
 * identity. Every screen/component should read colors/spacing/type from
 * here rather than hardcoding values, so the whole app moves together.
 */

export const colors = {
  // Brand.
  primary: "#6366F1",
  primaryPressed: "#4F46E5",
  primaryLight: "#EEF2FF",

  // Text.
  textPrimary: "#0F172A",
  textSecondary: "#64748B",
  textMuted: "#94A3B8",
  textOnPrimary: "#FFFFFF",

  // Structure.
  background: "#F8FAFC",
  surface: "#FFFFFF",
  border: "#E2E8F0",
  neutral: "#F1F5F9",

  // Semantic — meaning, not brand. Never let these compete with indigo.
  success: "#10B981",
  successBg: "#ECFDF5",
  warning: "#F59E0B",
  warningBg: "#FFFBEB",
  danger: "#EF4444",
  dangerBg: "#FEF2F2",
  info: "#3B82F6",
  infoBg: "#EFF6FF",

  overlay: "rgba(15, 23, 42, 0.45)",
} as const;

/** Priority scale — soft filled pills, per the redesign spec. */
export const priorityColors = {
  LOW: { fg: colors.success, bg: colors.successBg },
  MEDIUM: { fg: colors.warning, bg: colors.warningBg },
  HIGH: { fg: colors.danger, bg: colors.dangerBg },
} as const;

/** Assignment-status scale (Inbox/Sent). */
export const statusColors = {
  PENDING: { fg: colors.warning, bg: colors.warningBg },
  ACCEPTED: { fg: colors.success, bg: colors.successBg },
  DECLINED: { fg: colors.danger, bg: colors.dangerBg },
  CANCELLED: { fg: colors.textSecondary, bg: colors.neutral },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/**
 * Type scale. Hierarchy is built from size + weight + color together, not
 * size alone — see usage: a screen title is heavy + textPrimary, metadata is
 * medium + textSecondary, at a much smaller size.
 */
export const fontSize = {
  tiny: 11,
  small: 12,
  meta: 13,
  body: 15,
  taskTitle: 16,
  sectionTitle: 19,
  screenTitle: 30,
} as const;

/**
 * Plus Jakarta Sans, for the wordmark and every screen's main headline only —
 * everything else (body copy, labels, meta text) stays on the system font.
 * Loaded once via useFonts() in the root layout before any screen renders.
 */
export const fontFamily = {
  heading: "PlusJakartaSans_800ExtraBold",
  headingSemiBold: "PlusJakartaSans_700Bold",
} as const;

/** Minimal, native-feeling shadow — used sparingly (e.g. the FAB), never on ordinary cards. */
export const shadow = {
  shadowColor: "#0F172A",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.15,
  shadowRadius: 8,
  elevation: 4,
} as const;

/** Standard opacity applied to any disabled interactive control. */
export const disabledOpacity = 0.5;

/** Minimum comfortable touch target (accessibility). */
export const minTouchTarget = 44;
