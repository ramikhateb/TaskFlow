import { Router } from "express";
import { userSearchQuerySchema } from "@taskflow/shared";
import type { Env } from "../env";
import { createUserController } from "../controllers/userController";
import { requireAuth } from "../middleware/auth";
import { validateQuery } from "../middleware/validate";
import * as userRepository from "../repositories/userRepository";
import { createUserService } from "../services/userService";

export function createUserRoutes(env: Env): Router {
  const userService = createUserService({ userRepository });
  const controller = createUserController(userService);
  const router = Router();

  // FR-18/FR-19: authenticated discovery only, never a public directory.
  router.use(requireAuth(env));
  router.get("/search", validateQuery(userSearchQuerySchema), controller.search);

  return router;
}
