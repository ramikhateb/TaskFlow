import * as SecureStore from "expo-secure-store";

// The refresh token is a credential — it lives only in SecureStore on-device,
// never in Zustand/AsyncStorage/plain state (ARCHITECTURE.md §2).
const REFRESH_TOKEN_KEY = "taskflow.refreshToken";

export function getStoredRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export function setStoredRefreshToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export function clearStoredRefreshToken(): Promise<void> {
  return SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}
