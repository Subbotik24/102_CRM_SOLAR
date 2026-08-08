import type { Response } from "express";
import { ZodError } from "zod";

export type ErrorBody = { error: string; code: string; issues?: unknown };

export class ApplicationError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly issues?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends ApplicationError {
  constructor(message = "Invalid request", issues?: unknown) {
    super(message, 400, "validation_error", issues);
  }
}

export class ForbiddenError extends ApplicationError {
  constructor(message = "Forbidden") { super(message, 403, "forbidden"); }
}

export class NotFoundError extends ApplicationError {
  constructor(message = "Not found") { super(message, 404, "not_found"); }
}

export class ConflictError extends ApplicationError {
  constructor(message = "Conflict", code = "conflict") { super(message, 409, code); }
}

export class ServiceUnavailableError extends ApplicationError {
  constructor(message = "Service unavailable", code = "service_unavailable") { super(message, 503, code); }
}

export function toErrorResponse(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof ApplicationError) {
    return {
      status: err.status,
      body: { error: err.message, code: err.code, ...(err.issues === undefined ? {} : { issues: err.issues }) },
    };
  }
  if (err instanceof ZodError) {
    return { status: 400, body: { error: "Invalid request", code: "validation_error", issues: err.issues } };
  }
  return { status: 500, body: { error: "Internal server error", code: "internal_error" } };
}

export function sendError(res: Response, err: unknown): void {
  const { status, body } = toErrorResponse(err);
  res.status(status).json(body);
}
