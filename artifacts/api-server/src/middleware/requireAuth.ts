import type { Request, Response, NextFunction } from "express";
import { getUserById } from "../services/access/authService";
import type { User } from "@workspace/db";

// Augment Express Request with the current user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Middleware that enforces authentication on a route.
 *
 * On success: attaches `req.user` (the full user record) and calls next().
 * On failure: responds 401 and does NOT call next().
 *
 * Suspended users are rejected even if their session is valid —
 * this is the server-side enforcement of account suspension.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.session.userId;

  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const user = await getUserById(userId);

  if (!user || user.status === "suspended") {
    // Invalidate the stale or suspended session
    req.session.destroy(() => {});
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  req.user = user;
  next();
}
