/**
 * Admin API routes.
 *
 * All routes require auth + admin:access authorization.
 *
 * Users:
 *   GET    /admin/users            — list users (optional ?q=)
 *   GET    /admin/users/:id        — get user
 *   PATCH  /admin/users/:id        — update role / status
 *   POST   /admin/invitations      — create invitation
 *
 * Audit log:
 *   GET    /admin/audit-log        — list events (filters: actorId, action, dateFrom, dateTo, limit, offset)
 *   GET    /admin/audit-log.csv    — CSV export
 *
 * Settings:
 *   GET    /admin/settings         — list key-value pairs
 *   PATCH  /admin/settings         — upsert a key-value pair
 */
import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { authorize, ForbiddenError } from "../services/access";
import {
  listUsers,
  getUserById,
  updateUserRole,
  suspendUser,
  reactivateUser,
  createInvitation,
  deleteUser,
} from "../services/admin/users";
import { logAudit } from "../services/audit";
import { pool, db, settingsTable } from "@workspace/db";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { sendError, ValidationError } from "../services/errors";
import { deliverPasswordResetLink } from "../services/admin/passwordReset";

const router = Router();

// All admin routes require admin role.
// The "/admin" prefix is essential: an unpathed `router.use` here matches every
// request that falls through the earlier routers, which turned every unknown
// /api/* path into a 401 instead of a 404.
router.use("/admin", requireAuth, (req, res, next) => {
  try {
    authorize(req.user!, "admin:access");
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) {
      res.status(403).json({ error: err.message });
      return;
    }
    next(err);
  }
});

// ── Users ──────────────────────────────────────────────────────────────────────

router.get("/admin/users", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const users = await listUsers({ q });
  res.json({ users });
});

router.get("/admin/users/:id", async (req, res) => {
  const user = await getUserById(req.params.id);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(user);
});

const updateUserSchema = z.object({
  role: z.enum(["admin", "manager", "member", "guest"]).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  avatarKey: z.enum(["1", "2", "3", "4", "5", "6"]).optional(),
  displayName: z.string().min(1).max(100).optional(),
});

router.patch("/admin/users/:id", async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const targetId = req.params.id;
  const actor = req.user!;

  const { role, status, avatarKey, displayName } = parsed.data;
  let result;
  try {
    if (role !== undefined) {
      // Fetch before-role for audit
      const before = await getUserById(targetId);
      result = await updateUserRole(targetId, role);
      await logAudit({
        action: "user.role_changed",
        actorId: actor.id,
        entityType: "user",
        entityId: targetId,
        meta: { before: before?.role, after: role },
        ipAddress: req.ip,
      });
    }
    if (status === "suspended") {
      result = await suspendUser(targetId);
      await logAudit({ action: "user.suspended", actorId: actor.id, entityType: "user", entityId: targetId, ipAddress: req.ip });
    }
    if (status === "active") {
      result = await reactivateUser(targetId);
      await logAudit({ action: "user.reactivated", actorId: actor.id, entityType: "user", entityId: targetId, ipAddress: req.ip });
    }
    if (avatarKey !== undefined || displayName !== undefined) {
      const { db, usersTable } = await import("@workspace/db");
      const { eq } = await import("drizzle-orm");
      const patch: Record<string, unknown> = {};
      if (avatarKey !== undefined) patch.avatarKey = avatarKey;
      if (displayName !== undefined) patch.displayName = displayName;
      const [updated] = await db.update(usersTable).set(patch).where(eq(usersTable.id, targetId)).returning();
      result = updated;
      if (displayName !== undefined) {
        await logAudit({ action: "user.profile_updated", actorId: actor.id, entityType: "user", entityId: targetId, ipAddress: req.ip });
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "User not found") {
      res.status(404).json({ error: "User not found" }); return;
    }
    throw err;
  }

  res.json(result ?? { ok: true });
});

router.delete("/admin/users/:id", async (req, res) => {
  const targetId = req.params.id;
  const actor = req.user!;

  if (targetId === actor.id) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }

  try {
    await deleteUser(targetId, actor.id);
    await logAudit({
      action: "user.deleted",
      actorId: actor.id,
      entityType: "user",
      entityId: targetId,
      ipAddress: req.ip,
    });
    res.status(204).send();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("foreign key") || msg.includes("violates")) {
      res.status(409).json({ error: "Cannot delete user: they have associated data. Suspend instead." });
      return;
    }
    throw err;
  }
});

// ── Invitations ────────────────────────────────────────────────────────────────

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many invitation requests. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env["NODE_ENV"] !== "production" && LOOPBACK.has(req.ip ?? ""),
});

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["admin", "manager", "member", "guest"]).default("member"),
  locale: z.enum(["uk", "cs"]).optional(),
});

router.post("/admin/invitations", inviteLimiter, async (req, res) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, new ValidationError("Invalid invitation input", parsed.error.issues)); return; }
  try {
    const result = await createInvitation(
      parsed.data.email,
      parsed.data.role,
      req.user!.id,
      parsed.data.locale ?? req.user!.locale,
    );
    await logAudit({
      action: "invite.created",
      actorId: req.user!.id,
      entityType: "invitation",
      meta: { email: parsed.data.email, role: parsed.data.role },
      ipAddress: req.ip,
    });
    res.status(201).json(result);
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/admin/users/:id/reset-link", async (req, res) => {
  try {
    const user = await getUserById(req.params.id as string);
    if (!user) { res.status(404).json({ error: "User not found", code: "not_found" }); return; }
    const result = await deliverPasswordResetLink({
      id: user.id,
      email: user.email,
      locale: user.locale as "uk" | "cs",
    });
    await logAudit({ action: "auth.password_reset_requested", actorId: req.user!.id, entityType: "user", entityId: user.id, ipAddress: req.ip });
    res.status(201).json(result);
  } catch (err) {
    sendError(res, err);
  }
});

// ── Audit log ──────────────────────────────────────────────────────────────────

router.get("/admin/audit-log", async (req, res) => {
  const { actorId, action, dateFrom, dateTo } = req.query;
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const offset = Number(req.query.offset ?? 0);

  const conditions: string[] = [];
  const args: unknown[] = [];
  let n = 1;

  if (typeof actorId === "string" && actorId) {
    conditions.push(`al.actor_id = $${n++}`);
    args.push(actorId);
  }
  if (typeof action === "string" && action) {
    conditions.push(`al.action = $${n++}`);
    args.push(action);
  }
  if (typeof dateFrom === "string" && dateFrom) {
    conditions.push(`al.created_at >= $${n++}`);
    args.push(dateFrom);
  }
  if (typeof dateTo === "string" && dateTo) {
    conditions.push(`al.created_at <= $${n++}`);
    args.push(dateTo);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT al.id, al.actor_id, u.display_name AS actor_name, al.action,
            al.entity_type, al.entity_id, al.meta, al.ip_address, al.created_at
     FROM audit_log al
     LEFT JOIN users u ON u.id = al.actor_id
     ${where}
     ORDER BY al.created_at DESC
     LIMIT $${n++} OFFSET $${n}`,
    [...args, limit, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT count(*)::int AS total FROM audit_log al ${where}`,
    args
  );

  res.json({ logs: rows, total: countRows[0]?.total ?? 0 });
});

// CSV export
router.get("/admin/audit-log.csv", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT al.id, u.display_name AS actor, al.action, al.entity_type,
            al.entity_id, al.ip_address, al.created_at
     FROM audit_log al
     LEFT JOIN users u ON u.id = al.actor_id
     ORDER BY al.created_at DESC
     LIMIT 10000`
  );

  const header = "id,actor,action,entity_type,entity_id,ip_address,created_at\n";
  const csv = rows.map((r: Record<string, unknown>) =>
    [r.id, r.actor ?? "", r.action, r.entity_type ?? "", r.entity_id ?? "", r.ip_address ?? "", r.created_at]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
      .join(",")
  ).join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="audit-log.csv"`);
  res.send(header + csv);
});

// ── Settings ──────────────────────────────────────────────────────────────────

router.get("/admin/settings", async (req, res) => {
  const rows = await db.select().from(settingsTable);
  // Omit encrypted values (keys ending in _enc)
  const safe = rows
    .filter((r) => !r.key.endsWith("_enc"))
    .map((r) => ({ key: r.key, value: r.value, updatedAt: r.updatedAt.toISOString() }));
  res.json({ settings: safe });
});

const patchSettingsSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

router.patch("/admin/settings", async (req, res) => {
  const parsed = patchSettingsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const { key, value } = parsed.data;
  // Block writing encrypted values through this route
  if (key.endsWith("_enc")) { res.status(400).json({ error: "Cannot set encrypted settings via this endpoint" }); return; }

  await db
    .insert(settingsTable)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value, updatedAt: new Date() },
    });

  await logAudit({
    action: "settings.changed",
    actorId: req.user!.id,
    entityType: "setting",
    meta: { key },
    ipAddress: req.ip,
  });

  res.json({ key, value });
});

export default router;
