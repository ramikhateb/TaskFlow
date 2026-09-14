import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodTypeAny } from "zod";
import { ValidationError } from "../errors";

/**
 * Validates req.body against a shared Zod schema and replaces it with the
 * parsed (and defaulted/coerced) value. Everything past this middleware may
 * assume its input shape is already correct — per ARCHITECTURE.md §3.
 */
export function validateBody(schema: ZodTypeAny): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(new ValidationError("Invalid request body", result.error.flatten()));
      return;
    }
    req.body = result.data;
    next();
  };
}
