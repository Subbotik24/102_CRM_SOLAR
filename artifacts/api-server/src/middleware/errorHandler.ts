import type { Request, Response, NextFunction } from "express";
import { sendError, toErrorResponse } from "../services/errors";

const SAFE_PARSER_ERRORS = new Map<string, { status: number; message: string }>([
  ["entity.parse.failed", { status: 400, message: "Invalid request body" }],
  ["entity.too.large", { status: 413, message: "Request body too large" }],
  ["parameters.too.many", { status: 413, message: "Too many form parameters" }],
]);

/**
 * Last-resort JSON error handler.
 *
 * Routes normally translate their own failures via `handleError`. This catches
 * whatever escapes them — errors thrown from middleware, from `handleError`'s
 * own re-throw, or from a route that forgot a try/catch. Without it Express
 * falls back to its default handler, which replies with an HTML page carrying a
 * stack trace whenever NODE_ENV is not "production".
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (typeof err === "object" && err !== null && "type" in err) {
    const parserError = SAFE_PARSER_ERRORS.get(String(err.type));
    if (parserError) {
      res.status(parserError.status).json({ error: parserError.message, code: "validation_error" });
      return;
    }
  }

  const response = toErrorResponse(err);
  if (response.status === 500) req.log?.error({ err }, "Unhandled error");
  sendError(res, err);
}

/** JSON 404 for unmatched /api routes, so clients never get Express' HTML page. */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "Not found", code: "not_found" });
}
