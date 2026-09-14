import type { AuthResponse } from "@taskflow/shared";
import {
  clearStoredRefreshToken,
  getStoredRefreshToken,
  setStoredRefreshToken,
} from "../lib/secureStore";
import { getAccessToken, useSessionStore } from "../stores/sessionStore";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let inFlightRefresh: Promise<string | null> | null = null;

/**
 * Reads the refresh token from SecureStore, exchanges it for a new
 * access/refresh pair, and updates both stores. Used both on app startup
 * (session restore) and reactively on a 401 (see performFetch below).
 * Concurrent callers share one in-flight request so a burst of 401s can't
 * trigger a refresh stampede.
 */
export function refreshSession(): Promise<string | null> {
  if (!inFlightRefresh) {
    inFlightRefresh = performRefresh().finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

async function performRefresh(): Promise<string | null> {
  const storedRefreshToken = await getStoredRefreshToken();
  if (!storedRefreshToken) {
    return null;
  }

  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: storedRefreshToken }),
  });

  if (!response.ok) {
    // Refresh failed (expired, revoked, or reused) — the session is over.
    await clearStoredRefreshToken();
    useSessionStore.getState().setAccessToken(null);
    return null;
  }

  const data = (await response.json()) as AuthResponse;
  await setStoredRefreshToken(data.refreshToken);
  useSessionStore.getState().setAccessToken(data.accessToken);
  return data.accessToken;
}

export interface ApiFetchOptions extends RequestInit {
  /** Attaches the access token and, on a 401, retries once after refreshing. */
  auth?: boolean;
}

/**
 * Thin fetch wrapper. Every mobile API call goes through this so the base
 * URL, auth header, and refresh-on-401 retry stay in one place.
 */
export function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { auth = false, ...init } = options;
  return performFetch<T>(path, init, auth, false);
}

async function performFetch<T>(
  path: string,
  init: RequestInit,
  auth: boolean,
  isRetry: boolean,
): Promise<T> {
  const authHeaders: Record<string, string> = {};
  if (auth) {
    const token = getAccessToken();
    if (token) {
      authHeaders.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders, ...init.headers },
  });

  if (response.status === 401 && auth && !isRetry) {
    const newToken = await refreshSession();
    if (newToken) {
      return performFetch<T>(path, init, auth, true);
    }
    // Refresh failed — session already cleared; fall through to report the 401.
  }

  if (!response.ok) {
    throw new ApiError(`Request to ${path} failed with status ${response.status}`, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
