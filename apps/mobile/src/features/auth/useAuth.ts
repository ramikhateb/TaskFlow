import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LoginRequest, RegisterRequest, UpdateProfileRequest } from "@taskflow/shared";
import {
  loginRequest,
  logoutRequest,
  meRequest,
  registerRequest,
  updateProfileRequest,
} from "../../api/auth";
import { logError } from "../../lib/devLog";
import {
  clearStoredRefreshToken,
  getStoredRefreshToken,
  setStoredRefreshToken,
} from "../../lib/secureStore";
import { useSessionStore } from "../../stores/sessionStore";
import { clearSessionCache } from "./clearSessionCache";

export const ME_QUERY_KEY = ["me"] as const;

/** Server state (the profile) lives in TanStack Query, not Zustand. */
export function useMe() {
  const accessToken = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: meRequest,
    enabled: accessToken !== null,
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  const setAccessToken = useSessionStore((s) => s.setAccessToken);

  return useMutation({
    mutationFn: (input: RegisterRequest) => registerRequest(input),
    onSuccess: async (data) => {
      // M12 (Phase 15): a previous session's cached server data (tasks,
      // inbox, sent, search results, ...) must never be visible to whoever
      // is signing in now — clear the whole cache before seeding the new
      // session's own profile, not just on logout. This also covers the
      // "session expired, user re-authenticates as someone else without an
      // explicit logout" path, where useLogout's own clear never runs.
      clearSessionCache(queryClient);
      await setStoredRefreshToken(data.refreshToken);
      setAccessToken(data.accessToken);
      queryClient.setQueryData(ME_QUERY_KEY, data.user);
    },
    onError: (error) => {
      logError("auth", "register failed", error);
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  const setAccessToken = useSessionStore((s) => s.setAccessToken);

  return useMutation({
    mutationFn: (input: LoginRequest) => loginRequest(input),
    onSuccess: async (data) => {
      // See useRegister above: clear any prior session's cached data first.
      clearSessionCache(queryClient);
      await setStoredRefreshToken(data.refreshToken);
      setAccessToken(data.accessToken);
      queryClient.setQueryData(ME_QUERY_KEY, data.user);
    },
    onError: (error) => {
      logError("auth", "login failed", error);
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateProfileRequest) => updateProfileRequest(input),
    onSuccess: (data) => {
      queryClient.setQueryData(ME_QUERY_KEY, data);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const setAccessToken = useSessionStore((s) => s.setAccessToken);

  return useMutation({
    mutationFn: async () => {
      const refreshToken = await getStoredRefreshToken();
      if (refreshToken) {
        // Best-effort: the session is cleared locally regardless of whether
        // the server round-trip succeeds.
        await logoutRequest(refreshToken).catch(() => undefined);
      }
    },
    onSettled: async () => {
      await clearStoredRefreshToken();
      setAccessToken(null);
      // M12 (Phase 15): drop every cached query, not just "me" — Tasks,
      // Today, Schedule, Inbox, Sent, and user-search results are all
      // per-account server state and must not survive into whichever
      // account signs in next on this device.
      clearSessionCache(queryClient);
    },
  });
}
