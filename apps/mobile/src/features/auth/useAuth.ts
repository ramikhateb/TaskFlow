import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LoginRequest, RegisterRequest } from "@taskflow/shared";
import { loginRequest, logoutRequest, meRequest, registerRequest } from "../../api/auth";
import {
  clearStoredRefreshToken,
  getStoredRefreshToken,
  setStoredRefreshToken,
} from "../../lib/secureStore";
import { useSessionStore } from "../../stores/sessionStore";

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
      await setStoredRefreshToken(data.refreshToken);
      setAccessToken(data.accessToken);
      queryClient.setQueryData(ME_QUERY_KEY, data.user);
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  const setAccessToken = useSessionStore((s) => s.setAccessToken);

  return useMutation({
    mutationFn: (input: LoginRequest) => loginRequest(input),
    onSuccess: async (data) => {
      await setStoredRefreshToken(data.refreshToken);
      setAccessToken(data.accessToken);
      queryClient.setQueryData(ME_QUERY_KEY, data.user);
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
      queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}
