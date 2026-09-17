import { z } from "zod";

// M7 (FR-1a): username is the user's public product identity — used for
// discovery/collaboration — kept deliberately separate from email, which is
// private and used only for authentication. Stored WITHOUT the "@" prefix;
// the UI adds "@" for display only, so the stored value is a clean,
// URL-safe slug (e.g. usable later as /u/<username>) rather than a string
// that always needs stripping before it's useful.
//
// Rules (chosen conservatively, not exhaustively):
//   - 3-20 characters
//   - lowercase ASCII letters, digits, underscore, period only
//   - must start with a letter or digit (not underscore/period)
// Deliberately not policing things like consecutive/trailing periods —
// more rules than that isn't earning its complexity for v1.
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 20;
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_.]*$/;

/**
 * Trim, strip a single leading "@" (so "@rami" and "rami" behave
 * identically everywhere — registration, search queries, etc.), lowercase.
 * The one canonical normalization used before every persistence or
 * comparison — never re-implemented ad hoc elsewhere.
 */
export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

export const usernameSchema = z
  .string()
  .transform(normalizeUsername)
  .pipe(
    z
      .string()
      .min(USERNAME_MIN_LENGTH, `Username must be at least ${USERNAME_MIN_LENGTH} characters`)
      .max(USERNAME_MAX_LENGTH, `Username must be at most ${USERNAME_MAX_LENGTH} characters`)
      .regex(
        USERNAME_PATTERN,
        "Username may only contain lowercase letters, numbers, underscore, and period, and must start with a letter or number",
      ),
  );
export type Username = z.infer<typeof usernameSchema>;

// What another user is allowed to see via search/collaboration — never
// email, passwordHash, tokens, or any other account/security field.
export const publicUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

// FR-19a: bounds chosen to keep this a useful discovery tool without being
// an account-enumeration surface — see the M7 report for the full rationale.
export const USER_SEARCH_MIN_QUERY_LENGTH = 2;
export const USER_SEARCH_MAX_QUERY_LENGTH = 50;

export const userSearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .transform((value) => value.replace(/^@/, "").toLowerCase())
    .pipe(
      z
        .string()
        .min(
          USER_SEARCH_MIN_QUERY_LENGTH,
          `Search query must be at least ${USER_SEARCH_MIN_QUERY_LENGTH} characters`,
        )
        .max(
          USER_SEARCH_MAX_QUERY_LENGTH,
          `Search query must be at most ${USER_SEARCH_MAX_QUERY_LENGTH} characters`,
        ),
    ),
});
export type UserSearchQuery = z.infer<typeof userSearchQuerySchema>;

export const userSearchResponseSchema = z.object({
  data: z.array(publicUserSchema),
});
export type UserSearchResponse = z.infer<typeof userSearchResponseSchema>;
