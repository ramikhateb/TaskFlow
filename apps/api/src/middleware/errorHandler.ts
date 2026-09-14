import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors";

/**
 * Single place that turns thrown errors into the JSON shape from
 * ARCHITECTURE.md §4. Must be registered last, after all routes.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details ?? {} },
    });
    return;
  }

  const correlationId = randomUUID();
  console.error(`[unhandled error] correlationId=${correlationId}`, err);
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
      details: { correlationId },
    },
  });
}
