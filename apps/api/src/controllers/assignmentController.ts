import type { Request, Response } from "express";
import type {
  AcceptTaskAssignmentRequest,
  AssignmentIdRouteParam,
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

  // M9 — mounted separately at "/assignments" (see routes/inboxRoutes.ts),
  // addressed by assignmentId alone since these are recipient-scoped, not
  // task-scoped, actions.
  const decline = asyncHandler(async (req: Request, res: Response) => {
    const { assignmentId } = req.params as unknown as AssignmentIdRouteParam;
    const result = await assignmentService.declineAssignment(requireUserId(req), assignmentId);
    res.status(200).json(result);
  });

  const accept = asyncHandler(async (req: Request, res: Response) => {
    const { assignmentId } = req.params as unknown as AssignmentIdRouteParam;
    const body = req.body as AcceptTaskAssignmentRequest;
    const result = await assignmentService.acceptAssignment(requireUserId(req), assignmentId, body);
    res.status(200).json(result);
  });

  const inbox = asyncHandler(async (req: Request, res: Response) => {
    // No query params read here at all — the recipient is always the
    // verified caller (req.user.id), never a client-supplied id (M9 spec).
    const result = await assignmentService.getInbox(requireUserId(req));
    res.status(200).json(result);
  });

  // M10 — the sender's own history (FR-29). Same "no query params read"
  // rule as inbox: fromUserId is always the verified caller.
  const sent = asyncHandler(async (req: Request, res: Response) => {
    const result = await assignmentService.getSentAssignments(requireUserId(req));
    res.status(200).json(result);
  });

  return { create, cancel, decline, accept, inbox, sent };
}
