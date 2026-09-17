import { Router } from "express";
import {
  createTaskAssignmentRequestSchema,
  taskAssignmentRouteParamSchema,
  taskIdRouteParamSchema,
} from "@taskflow/shared";
import type { Env } from "../env";
import { createAssignmentController } from "../controllers/assignmentController";
import { requireAuth } from "../middleware/auth";
import { validateBody, validateParams } from "../middleware/validate";
import * as taskAssignmentRepository from "../repositories/taskAssignmentRepository";
import * as taskRepository from "../repositories/taskRepository";
import * as userRepository from "../repositories/userRepository";
import { createAssignmentService } from "../services/assignmentService";

// Mounted at "/tasks" alongside taskRoutes — different path depth
// ("/:taskId/assignments...") means there's no ambiguity with taskRoutes'
// "/:id" task-detail routes.
export function createAssignmentRoutes(env: Env): Router {
  const assignmentService = createAssignmentService({
    assignmentRepository: taskAssignmentRepository,
    taskRepository,
    userRepository,
  });
  const controller = createAssignmentController(assignmentService);
  const router = Router();

  router.use(requireAuth(env));

  router.post(
    "/:taskId/assignments",
    validateParams(taskIdRouteParamSchema),
    validateBody(createTaskAssignmentRequestSchema),
    controller.create,
  );
  router.post(
    "/:taskId/assignments/:assignmentId/cancel",
    validateParams(taskAssignmentRouteParamSchema),
    controller.cancel,
  );

  return router;
}
