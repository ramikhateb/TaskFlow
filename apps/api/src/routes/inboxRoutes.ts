import { Router } from "express";
import { acceptTaskAssignmentRequestSchema, assignmentIdRouteParamSchema } from "@taskflow/shared";
import type { Env } from "../env";
import { createAssignmentController } from "../controllers/assignmentController";
import { requireAuth } from "../middleware/auth";
import { validateBody, validateParams } from "../middleware/validate";
import * as taskAssignmentRepository from "../repositories/taskAssignmentRepository";
import * as taskRepository from "../repositories/taskRepository";
import * as userRepository from "../repositories/userRepository";
import { createAssignmentService } from "../services/assignmentService";

/**
 * M9: mounted at "/assignments" — flat, not nested under "/tasks" like
 * assignmentRoutes.ts's create/cancel. Inbox/accept/decline are addressed
 * by assignment id and scoped to the recipient (toUserId), not the task's
 * current assignee, so nesting under a task id would add nothing (the
 * recipient doesn't necessarily know or care about the task's id up
 * front — they're browsing their Inbox, not a specific task). See
 * docs/ARCHITECTURE.md §3 for the create/cancel-vs-accept/decline route
 * shape rationale.
 *
 * Builds its own AssignmentService instance from the same repository
 * modules assignmentRoutes.ts/taskRoutes.ts use — independent instances
 * backed by shared, stateless repository functions, the same pattern used
 * throughout this API (no shared service singleton).
 */
export function createInboxRoutes(env: Env): Router {
  const assignmentService = createAssignmentService({
    assignmentRepository: taskAssignmentRepository,
    taskRepository,
    userRepository,
  });
  const controller = createAssignmentController(assignmentService);
  const router = Router();

  router.use(requireAuth(env));

  router.get("/inbox", controller.inbox);
  router.post(
    "/:assignmentId/accept",
    validateParams(assignmentIdRouteParamSchema),
    validateBody(acceptTaskAssignmentRequestSchema),
    controller.accept,
  );
  router.post(
    "/:assignmentId/decline",
    validateParams(assignmentIdRouteParamSchema),
    controller.decline,
  );

  return router;
}
