import type { QueryClient } from "@tanstack/react-query";

/**
 * The one thing every "a different account might use this device next" path
 * (logout, login, register) must do before anything else: drop every cached
 * query. Tasks/Today/Schedule/Inbox/Sent/user-search results are all
 * per-account server state (M12, Phase 15) — the previous account's data
 * must never remain visible, even momentarily, once a new session starts.
 * Pulled out as its own function purely so this specific privacy guarantee
 * has a direct unit test, independent of rendering the hooks that call it.
 */
export function clearSessionCache(queryClient: QueryClient): void {
  queryClient.clear();
}
