import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Env } from "../env";
import { UnauthenticatedError } from "../errors";
import { verifyAccessToken } from "../lib/tokens";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- required for Express's declaration-merging pattern
  namespace Express {
    interface Request {
      user?: { id: string };
    }
  }
}

/**
 * Verifies the JWT access token from the Authorization header and attaches
 * req.user. Authorization elsewhere in the app must key off req.user.id —
 * never a client-supplied id — per ARCHITECTURE.md §6.
 */
export function requireAuth(env: Env): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      next(new UnauthenticatedError("Missing or malformed Authorization header"));
      return;
    }

    const token = header.slice("Bearer ".length);

    try {
      const payload = verifyAccessToken(token, env);
      req.user = { id: payload.sub };
      next();
    } catch {
      next(new UnauthenticatedError("Invalid or expired access token"));
    }
  };
}
