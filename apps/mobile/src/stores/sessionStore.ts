import { create } from "zustand";

// Client/UI state only, per ARCHITECTURE.md §2: the access token lives here,
// in memory, and nowhere else (never AsyncStorage/SecureStore). The user
// profile is server state and belongs to TanStack Query (useMe), not here.
interface SessionState {
  accessToken: string | null;
  isRestoring: boolean;
  setAccessToken: (token: string | null) => void;
  finishRestoring: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  accessToken: null,
  isRestoring: true,
  setAccessToken: (accessToken) => set({ accessToken }),
  finishRestoring: () => set({ isRestoring: false }),
}));

/** Non-hook accessor for use outside React (e.g. the API client). */
export function getAccessToken(): string | null {
  return useSessionStore.getState().accessToken;
}
