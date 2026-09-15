import { Router } from "express";
import {
  createTaskRequestSchema,
  taskIdParamSchema,
  updateTaskRequestSchema,
} from "@taskflow/shared";
import type { Env } from "../env";
import { createTaskController } from "../controllers/taskController";
import { requireAuth } from "../middleware/auth";
import { validateBody, validateParams } from "../middleware/validate";
import * as taskRepository from "../repositories/taskRepository";
import { createTaskService } from "../services/taskService";

export function createTaskRoutes(env: Env): Router {
  const taskService = createTaskService({ taskRepository });
  const controller = createTaskController(taskService);
  const router = Router();

  // Every task route requires authentication (ARCHITECTURE.md §3).
  router.use(requireAuth(env));

  router.get("/", controller.list);
  router.post("/", validateBody(createTaskRequestSchema), controller.create);
  router.get("/:id", validateParams(taskIdParamSchema), controller.getOne);
  router.patch(
    "/:id",
    validateParams(taskIdParamSchema),
    validateBody(updateTaskRequestSchema),
    controller.update,
  );
  router.delete("/:id", validateParams(taskIdParamSchema), controller.remove);

  return router;
}
