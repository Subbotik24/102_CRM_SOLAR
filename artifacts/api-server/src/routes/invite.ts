/**
 * Invitation acceptance routes.
 * POST /auth/invite/accept — validate token, create user, start session
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { acceptInvitation } from "../services/admin/users";
import { logAudit } from "../services/audit";
import { z } from "zod";

const router = Router();

const acceptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const acceptSchema = z.object({
  token: z.string().min(1),
  displayName: z.string().min(1).max(200),
  password: z.string().min(8),
});

router.post("/auth/invite/accept", acceptLimiter, async (req, res): Promise<void> => {
  const parsed = acceptSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  // This endpoint is unauthenticated, so only messages we have explicitly
  // written are echoed back. Anything else (driver errors, constraint
  // violations) is logged and replaced — a raw error here previously returned
  // the full SQL INSERT statement to anonymous callers.
  const SAFE_ERRORS = new Set([
    "Invalid or expired invitation",
    "Invitation already accepted",
    "Invitation has expired",
    "An account already exists for this email address",
  ]);

  let user;
  try {
    user = await acceptInvitation(parsed.data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (SAFE_ERRORS.has(msg)) {
      res.status(400).json({ error: msg });
      return;
    }
    req.log.error({ err }, "Invitation acceptance failed");
    res.status(400).json({ error: "Could not accept this invitation" });
    return;
  }

  await logAudit({
    action: "invite.accepted",
    actorId: user.id,
    entityType: "user",
    entityId: user.id,
    ipAddress: req.ip,
  });

  req.session.regenerate((err) => {
    if (err) { res.status(500).json({ error: "Session error" }); return; }
    req.session.userId = user.id;
    req.session.save((err2) => {
      if (err2) { res.status(500).json({ error: "Session save error" }); return; }
      res.status(201).json({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        locale: user.locale,
      });
    });
  });
});

export default router;
