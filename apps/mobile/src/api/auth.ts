import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  UpdateProfileRequest,
  UserProfile,
} from "@taskflow/shared";
import { apiFetch } from "./client";

export function registerRequest(input: RegisterRequest): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify(input) });
}

export function loginRequest(input: LoginRequest): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(input) });
}

export function logoutRequest(refreshToken: string): Promise<void> {
  return apiFetch<void>("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
}

export function meRequest(): Promise<UserProfile> {
  return apiFetch<UserProfile>("/auth/me", { auth: true });
}

export function updateProfileRequest(input: UpdateProfileRequest): Promise<UserProfile> {
  return apiFetch<UserProfile>("/auth/me", {
    method: "PATCH",
    auth: true,
    body: JSON.stringify(input),
  });
}
