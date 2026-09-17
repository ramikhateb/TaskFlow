import type { Request, Response } from "express";
import type {
  CreateTaskAssignmentRequest,
  TaskAssignmentRouteParam,
  TaskIdRouteParam,
} from "@taskflow/shared";
import type { AssignmentService } from "../services/assignmentService";
import { UnauthenticatedError } from "../errors";
import { asyncHandler } from "../lib/asyncHandler";

function requireUserId(req: Request): string {
  if (!req.user) {
    throw new UnauthenticatedError("Missing authenticated user");
  }
  return req.user.id;
}

// Thin: parse the already-validated request, call one service method, shape
// the HTTP response. No business-rule branching here (ARCHITECTURE.md §3).
export function createAssignmentController(assignmentService: AssignmentService) {
  const create = asyncHandler(async (req: Request, res: Response) => {
    const { taskId } = req.params as unknown as TaskIdRouteParam;
    const body = req.body as CreateTaskAssignmentRequest;
    const result = await assignmentService.createAssignment(requireUserId(req), taskId, body);
    res.status(201).json(result);
  });

  const cancel = asyncHandler(async (req: Request, res: Response) => {
    const { taskId, assignmentId } = req.params as unknown as TaskAssignmentRouteParam;
    const result = await assignmentService.cancelAssignment(
      requireUserId(req),
      taskId,
      assignmentId,
    );
    res.status(200).json(result);
  });

  return { create, cancel };
}
