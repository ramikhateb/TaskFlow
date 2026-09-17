import { useQuery } from "@tanstack/react-query";
import { searchUsersRequest } from "../../api/users";
import { normalizeSearchQuery, USER_SEARCH_MIN_QUERY_LENGTH } from "./normalizeSearchQuery";

/**
 * Takes the raw (already-debounced) query text and normalizes it before both
 * the cache key and the request — so "Rami", " rami ", and "@rami" share one
 * cache entry rather than three, and the enabled/disabled state matches
 * exactly what the server would accept.
 */
export function useUserSearch(rawQuery: string) {
  const normalized = normalizeSearchQuery(rawQuery);
  const enabled = normalized.length >= USER_SEARCH_MIN_QUERY_LENGTH;

  return useQuery({
    queryKey: ["users", "search", normalized] as const,
    queryFn: async () => (await searchUsersRequest(normalized)).data,
    enabled,
  });
}
