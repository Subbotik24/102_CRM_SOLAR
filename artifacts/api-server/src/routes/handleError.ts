import type { Response } from "express";
import { sendError } from "../services/errors";

/** Shared JSON error responder for thin routes. */
export function handleError(err: unknown, res: Response): void {
  sendError(res, err);
}
