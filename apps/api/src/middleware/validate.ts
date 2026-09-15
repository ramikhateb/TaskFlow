import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodTypeAny } from "zod";
import { ValidationError } from "../errors";

/**
 * Validates req[source] against a shared Zod schema and replaces it with the
 * parsed (and defaulted/coerced) value. Everything past this middleware may
 * assume its input shape is already correct — per ARCHITECTURE.md §3.
 */
function makeValidator(source: "body" | "params") {
  return (schema: ZodTypeAny): RequestHandler =>
    (req: Request, _res: Response, next: NextFunction) => {
      const result = schema.safeParse(req[source]);
      if (!result.success) {
        next(new ValidationError(`Invalid request ${source}`, result.error.flatten()));
        return;
      }
      req[source] = result.data;
      next();
    };
}

export const validateBody = makeValidator("body");
export const validateParams = makeValidator("params");
