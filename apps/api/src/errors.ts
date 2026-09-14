// Typed domain errors, mapped to HTTP responses by middleware/errorHandler.ts.
// Per ARCHITECTURE.md §4 — services throw these, controllers never build
// error responses by hand.

export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly code = "VALIDATION_ERROR";
}

export class UnauthenticatedError extends AppError {
  readonly statusCode = 401;
  readonly code = "UNAUTHENTICATED";
}

export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly code = "FORBIDDEN";
}

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND";
}

export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = "CONFLICT";
}
