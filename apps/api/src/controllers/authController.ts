import type { Request, Response } from "express";
import type {
  LoginRequest,
  LogoutRequest,
  RefreshRequest,
  RegisterRequest,
  UpdateProfileRequest,
} from "@taskflow/shared";
import type { AuthService } from "../services/authService";
import { UnauthenticatedError } from "../errors";
import { asyncHandler } from "../lib/asyncHandler";

// Thin: parse the already-validated request, call one service method, shape
// the HTTP response. No business-rule branching here (ARCHITECTURE.md §3).
export function createAuthController(authService: AuthService) {
  const register = asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.register(req.body as RegisterRequest);
    res.status(201).json(result);
  });

  const login = asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.login(req.body as LoginRequest);
    res.status(200).json(result);
  });

  const refresh = asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body as RefreshRequest;
    const result = await authService.refresh(refreshToken);
    res.status(200).json(result);
  });

  const logout = asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body as LogoutRequest;
    await authService.logout(refreshToken);
    res.status(204).send();
  });

  const me = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new UnauthenticatedError("Missing authenticated user");
    }
    const profile = await authService.getProfile(req.user.id);
    res.status(200).json(profile);
  });

  const updateMe = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new UnauthenticatedError("Missing authenticated user");
    }
    const profile = await authService.updateProfile(req.user.id, req.body as UpdateProfileRequest);
    res.status(200).json(profile);
  });

  return { register, login, refresh, logout, me, updateMe };
}
