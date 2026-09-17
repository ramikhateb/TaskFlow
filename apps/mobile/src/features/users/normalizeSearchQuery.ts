export const USER_SEARCH_MIN_QUERY_LENGTH = 2;

/** Same normalization the API applies (trim, strip a leading "@", lowercase) — kept in sync so the mobile UI's "too short" check matches what the server will actually accept. */
export function normalizeSearchQuery(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

export function isSearchQueryTooShort(raw: string): boolean {
  const normalized = normalizeSearchQuery(raw);
  return normalized.length > 0 && normalized.length < USER_SEARCH_MIN_QUERY_LENGTH;
}
