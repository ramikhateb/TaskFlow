import { Router } from "express";
import {
  loginRequestSchema,
  logoutRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
} from "@taskflow/shared";
import type { Env } from "../env";
import { createAuthController } from "../controllers/authController";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as refreshTokenRepository from "../repositories/refreshTokenRepository";
import * as userRepository from "../repositories/userRepository";
import { createAuthService } from "../services/authService";

export function createAuthRoutes(env: Env): Router {
  const authService = createAuthService({ userRepository, refreshTokenRepository, env });
  const controller = createAuthController(authService);
  const router = Router();

  router.post("/register", validateBody(registerRequestSchema), controller.register);
  router.post("/login", validateBody(loginRequestSchema), controller.login);
  router.post("/refresh", validateBody(refreshRequestSchema), controller.refresh);
  router.post("/logout", validateBody(logoutRequestSchema), controller.logout);
  router.get("/me", requireAuth(env), controller.me);

  return router;
}
