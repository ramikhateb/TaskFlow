import type { Request, Response } from "express";
import type {
  CreateTaskRequest,
  DateRangeQuery,
  ListTasksQuery,
  TaskIdParam,
  UpdateTaskRequest,
} from "@taskflow/shared";
import type { TaskService } from "../services/taskService";
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
export function createTaskController(taskService: TaskService) {
  const list = asyncHandler(async (req: Request, res: Response) => {
    const filters = req.query as unknown as ListTasksQuery;
    const tasks = await taskService.listOwnTasks(requireUserId(req), filters);
    res.status(200).json({ data: tasks });
  });

  const create = asyncHandler(async (req: Request, res: Response) => {
    const task = await taskService.createTask(requireUserId(req), req.body as CreateTaskRequest);
    res.status(201).json(task);
  });

  const getOne = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as unknown as TaskIdParam;
    const detail = await taskService.getTaskDetail(requireUserId(req), id);
    res.status(200).json(detail);
  });

  const update = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as unknown as TaskIdParam;
    const task = await taskService.updateTask(
      requireUserId(req),
      id,
      req.body as UpdateTaskRequest,
    );
    res.status(200).json(task);
  });

  const remove = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as unknown as TaskIdParam;
    await taskService.deleteTask(requireUserId(req), id);
    res.status(204).send();
  });

  const today = asyncHandler(async (req: Request, res: Response) => {
    const range = req.query as unknown as DateRangeQuery;
    const result = await taskService.getToday(requireUserId(req), range);
    res.status(200).json(result);
  });

  const schedule = asyncHandler(async (req: Request, res: Response) => {
    const range = req.query as unknown as DateRangeQuery;
    const data = await taskService.getSchedule(requireUserId(req), range);
    res.status(200).json({ data });
  });

  return { list, create, getOne, update, remove, today, schedule };
}
