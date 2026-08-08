import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  validateCredentials,
  recordLogin,
  AuthError,
  SuspendedError,
} from "../services/access/authService";
import { requireAuth } from "../middleware/requireAuth";
import { logAudit } from "../services/audit";
import { requestPasswordReset, resetPassword } from "../services/admin/passwordReset";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { User } from "@workspace/db";
import { z } from "zod";

const router = Router();

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: "Too many attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip loopback in dev/test so integration tests are not blocked
  skip: (req) => process.env["NODE_ENV"] !== "production" && LOOPBACK.has(req.ip ?? ""),
});

function userToResponse(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    position: user.position ?? null,
    role: user.role,
    locale: user.locale,
    timezone: user.timezone,
    status: user.status,
    avatarKey: user.avatarKey ?? "1",
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

// ── Login ─────────────────────────────────────────────────────────────────────

router.post("/auth/login", authLimiter, async (req, res): Promise<void> => {
  const { email, password } = req.body ?? {};

  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  let user: User;
  try {
    user = await validateCredentials(email, password);
  } catch (err) {
    if (err instanceof SuspendedError) {
      await logAudit({ action: "auth.login_failure", meta: { reason: "suspended", email }, ipAddress: req.ip });
      res.status(403).json({ error: "Account is suspended" });
      return;
    }
    if (err instanceof AuthError) {
      await logAudit({ action: "auth.login_failure", meta: { reason: "invalid_credentials", email }, ipAddress: req.ip });
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    throw err;
  }

  await recordLogin(user.id);
  await logAudit({ action: "auth.login_success", actorId: user.id, ipAddress: req.ip });

  req.session.regenerate((err) => {
    if (err) {
      req.log.error({ err }, "Session regeneration failed");
      res.status(500).json({ error: "Internal server error" });
      return;
    }

    req.session.userId = user.id;

    req.session.save((err2) => {
      if (err2) {
        req.log.error({ err: err2 }, "Session save failed");
        res.status(500).json({ error: "Internal server error" });
        return;
      }
      res.json(userToResponse(user));
    });
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────

router.post("/auth/logout", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  req.session.destroy((err) => {
    if (err) req.log.warn({ err }, "Session destroy error during logout");
    res.clearCookie("pds.sid");
    res.status(204).send();
  });
  await logAudit({ action: "auth.logout", actorId: userId, ipAddress: req.ip });
});

// ── Me ────────────────────────────────────────────────────────────────────────

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  res.json(userToResponse(req.user!));
});

// ── Profile update (self) ──────────────────────────────────────────────────────

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  position: z.string().max(100).optional().nullable(),
  avatarKey: z.enum(["1", "2", "3", "4", "5", "6"]).optional(),
});

router.patch("/profile", requireAuth, async (req, res): Promise<void> => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  try {
    await db
      .update(usersTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.id));
    const [updated] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.id))
      .limit(1);
    res.json(userToResponse(updated));
  } catch {
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// ── Forgot password ───────────────────────────────────────────────────────────

const forgotSchema = z.object({ email: z.string().min(1) });

router.post("/auth/forgot-password", authLimiter, async (req, res): Promise<void> => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "email is required" });
    return;
  }

  await requestPasswordReset(parsed.data.email);
  await logAudit({
    action: "auth.password_reset_requested",
    meta: { email: parsed.data.email },
    ipAddress: req.ip,
  });

  // Always 200 — do not reveal whether email exists
  res.json({ ok: true, message: "If this email is registered, a reset link has been sent." });
});

// ── Reset password ────────────────────────────────────────────────────────────

const resetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

router.post("/auth/reset-password", authLimiter, async (req, res): Promise<void> => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "token and newPassword (min 8 chars) are required" });
    return;
  }

  let userId: string;
  try {
    userId = await resetPassword(parsed.data.token, parsed.data.newPassword);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ error: msg });
    return;
  }

  await logAudit({
    action: "auth.password_reset_completed",
    actorId: userId,
    ipAddress: req.ip,
  });

  res.json({ ok: true, message: "Password reset successfully. Please log in with your new password." });
});

export default router;
