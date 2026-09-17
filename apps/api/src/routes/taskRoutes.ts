import { Router } from "express";
import {
  createTaskRequestSchema,
  dateRangeQuerySchema,
  listTasksQuerySchema,
  taskIdParamSchema,
  updateTaskRequestSchema,
} from "@taskflow/shared";
import type { Env } from "../env";
import { createTaskController } from "../controllers/taskController";
import { requireAuth } from "../middleware/auth";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import * as taskAssignmentRepository from "../repositories/taskAssignmentRepository";
import * as taskRepository from "../repositories/taskRepository";
import * as userRepository from "../repositories/userRepository";
import { createTaskService } from "../services/taskService";

export function createTaskRoutes(env: Env): Router {
  // taskService depends directly on the assignment REPOSITORY (not
  // AssignmentService) both to build GET /tasks/:id's additive
  // pendingAssignment field and to enforce FR-13/EC-5 (freeze mutations
  // while PENDING) — a repository-level dependency, not a cross-service
  // one. See docs/ARCHITECTURE.md and the M8 follow-up report. M10 adds a
  // userRepository dependency too, to resolve the assignee/creator
  // PublicUser identity shown on the task-detail response.
  const taskService = createTaskService({
    taskRepository,
    assignmentRepository: taskAssignmentRepository,
    userRepository,
  });
  const controller = createTaskController(taskService);
  const router = Router();

  // Every task route requires authentication (ARCHITECTURE.md §3).
  router.use(requireAuth(env));

  router.get("/", validateQuery(listTasksQuerySchema), controller.list);
  router.post("/", validateBody(createTaskRequestSchema), controller.create);
  // Must be registered before "/:id" — otherwise Express would match
  // "today"/"schedule" as an :id value.
  router.get("/today", validateQuery(dateRangeQuerySchema), controller.today);
  router.get("/schedule", validateQuery(dateRangeQuerySchema), controller.schedule);
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
