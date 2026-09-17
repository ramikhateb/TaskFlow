import type { Request, Response } from "express";
import type { UserSearchQuery } from "@taskflow/shared";
import type { UserService } from "../services/userService";
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
export function createUserController(userService: UserService) {
  const search = asyncHandler(async (req: Request, res: Response) => {
    const { q } = req.query as unknown as UserSearchQuery;
    const results = await userService.search(requireUserId(req), q);
    res.status(200).json({ data: results });
  });

  return { search };
}
