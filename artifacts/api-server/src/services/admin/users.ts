/**
 * Admin user-management service.
 * User enumeration, role changes, suspension/reactivation, invitations.
 */
import crypto from "crypto";
import argon2 from "argon2";
import { db, usersTable, invitationsTable } from "@workspace/db";
import type { User } from "@workspace/db";
import { and, eq, desc, gt, ilike, isNull, or, sql } from "drizzle-orm";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { logger } from "../../lib/logger";
import { deliverAccountLink } from "../../lib/mail";
import { normalizeInvitationEmail } from "./normalization";
export { normalizeInvitationEmail } from "./normalization";

// ── User list ─────────────────────────────────────────────────────────────────

export interface UserListItem {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  locale: string;
  avatarKey: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export async function listUsers(opts?: { q?: string }): Promise<UserListItem[]> {
  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      displayName: usersTable.displayName,
      role: usersTable.role,
      status: usersTable.status,
      locale: usersTable.locale,
      avatarKey: usersTable.avatarKey,
      lastLoginAt: usersTable.lastLoginAt,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(
      opts?.q
        ? or(
            ilike(usersTable.displayName, `%${opts.q}%`),
            ilike(usersTable.email, `%${opts.q}%`)
          )
        : undefined
    )
    .orderBy(desc(usersTable.createdAt));

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    displayName: r.displayName,
    role: r.role,
    status: r.status,
    locale: r.locale,
    avatarKey: r.avatarKey ?? null,
    lastLoginAt: r.lastLoginAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function deleteUser(id: string, actorId: string): Promise<void> {
  const { pool } = await import("@workspace/db");

  // ── Reassign NOT-NULL RESTRICT FK references ───────────────────────────────
  // files.uploader_id — NOT NULL, reassign to the admin performing deletion
  await pool.query(
    `UPDATE files SET uploader_id = $1 WHERE uploader_id = $2`,
    [actorId, id]
  );
  // kb_articles.created_by_id — NOT NULL, reassign to admin
  await pool.query(
    `UPDATE kb_articles SET created_by_id = $1 WHERE created_by_id = $2`,
    [actorId, id]
  );
  // kb_article_versions.created_by_id — NOT NULL, reassign to admin
  await pool.query(
    `UPDATE kb_article_versions SET created_by_id = $1 WHERE created_by_id = $2`,
    [actorId, id]
  );
  // file_links.linked_by_id — NOT NULL, delete the link rows
  await pool.query(`DELETE FROM file_links WHERE linked_by_id = $1`, [id]);
  // project_log_entries.actor_id — NOT NULL, delete the entries
  await pool.query(`DELETE FROM project_log_entries WHERE actor_id = $1`, [id]);
  // activity_events.actor_id — NOT NULL, delete the entries
  await pool.query(`DELETE FROM activity_events WHERE actor_id = $1`, [id]);

  // audit_log.actor_id has ON DELETE SET NULL — postgres handles it automatically.
  // Do NOT attempt DELETE on audit_log: it has an append-only trigger that blocks it.

  await db.delete(usersTable).where(eq(usersTable.id, id));
}

export async function getUserById(id: string): Promise<UserListItem | null> {
  const [row] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id));
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    status: row.status,
    locale: row.locale,
    avatarKey: row.avatarKey ?? null,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

// ── Role / status mutations ───────────────────────────────────────────────────

export async function updateUserRole(
  id: string,
  role: User["role"]
): Promise<UserListItem> {
  const [updated] = await db
    .update(usersTable)
    .set({ role, updatedAt: new Date() })
    .where(eq(usersTable.id, id))
    .returning();
  if (!updated) throw new NotFoundError("User not found");
  return {
    id: updated.id,
    email: updated.email,
    displayName: updated.displayName,
    role: updated.role,
    status: updated.status,
    locale: updated.locale,
    avatarKey: updated.avatarKey ?? null,
    lastLoginAt: updated.lastLoginAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
  };
}

export async function suspendUser(id: string): Promise<UserListItem> {
  const [updated] = await db
    .update(usersTable)
    .set({ status: "suspended", updatedAt: new Date() })
    .where(eq(usersTable.id, id))
    .returning();
  if (!updated) throw new NotFoundError("User not found");
  return {
    id: updated.id,
    email: updated.email,
    displayName: updated.displayName,
    role: updated.role,
    status: updated.status,
    locale: updated.locale,
    avatarKey: updated.avatarKey ?? null,
    lastLoginAt: updated.lastLoginAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
  };
}

export async function reactivateUser(id: string): Promise<UserListItem> {
  const [updated] = await db
    .update(usersTable)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(usersTable.id, id))
    .returning();
  if (!updated) throw new NotFoundError("User not found");
  return {
    id: updated.id,
    email: updated.email,
    displayName: updated.displayName,
    role: updated.role,
    status: updated.status,
    locale: updated.locale,
    avatarKey: updated.avatarKey ?? null,
    lastLoginAt: updated.lastLoginAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
  };
}

// ── Invitations ───────────────────────────────────────────────────────────────

export interface InvitationResult {
  invitationId: string;
  email: string;
  role: string;
  token?: string; // raw token is shown only for local console delivery
  delivery: "console" | "smtp";
  expiresAt: string;
}

export async function createInvitation(
  email: string,
  role: User["role"],
  invitedById: string,
  locale: User["locale"] = "uk",
): Promise<InvitationResult> {
  const normalizedEmail = normalizeInvitationEmail(email);
  const [existingUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail))
    .limit(1);
  if (existingUser) throw new ConflictError("An account with this email already exists", "account_exists");

  const [pendingInvitation] = await db
    .select({ id: invitationsTable.id })
    .from(invitationsTable)
    .where(and(
      sql`lower(${invitationsTable.email}) = ${normalizedEmail}`,
      isNull(invitationsTable.acceptedAt),
      gt(invitationsTable.expiresAt, new Date()),
    ))
    .limit(1);
  if (pendingInvitation) throw new ConflictError("A pending invitation already exists for this email", "invitation_pending");

  // Generate 32-byte random token
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const [inv] = await db
    .insert(invitationsTable)
    .values({
      email: normalizedEmail,
      role,
      locale,
      tokenHash,
      expiresAt,
      invitedById,
    })
    .returning();

  let delivery: "console" | "smtp";
  try {
    delivery = await deliverAccountLink({ kind: "invitation", email: normalizedEmail, token: rawToken, locale });
  } catch (err) {
    await db.delete(invitationsTable).where(eq(invitationsTable.id, inv.id));
    throw err;
  }
  logger.info({ invitationId: inv.id, email: normalizedEmail, delivery }, "Invitation created");

  return {
    invitationId: inv.id,
    email: inv.email,
    role: inv.role,
    ...(delivery === "console" ? { token: rawToken } : {}),
    delivery,
    expiresAt: inv.expiresAt.toISOString(),
  };
}

// ── Invite acceptance ─────────────────────────────────────────────────────────

export interface AcceptInviteInput {
  token: string;
  displayName: string;
  password: string;
}

export async function acceptInvitation(
  input: AcceptInviteInput
): Promise<User> {
  const tokenHash = crypto
    .createHash("sha256")
    .update(input.token)
    .digest("hex");

  const [inv] = await db
    .select()
    .from(invitationsTable)
    .where(eq(invitationsTable.tokenHash, tokenHash));

  if (!inv) throw new ValidationError("Invalid or expired invitation");
  if (inv.acceptedAt) throw new ConflictError("Invitation already accepted", "invitation_used");
  if (inv.expiresAt < new Date()) throw new ValidationError("Invitation has expired");

  // An invitation can be issued for an address that already has an account.
  // Without this check the INSERT below hits the unique constraint on email and
  // the raw driver error — including the full SQL statement — was returned to an
  // unauthenticated caller.
  const [existingUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, inv.email))
    .limit(1);

  if (existingUser) {
    throw new ConflictError("An account already exists for this email address", "account_exists");
  }

  const passwordHash = await argon2.hash(input.password);

  // Create user
  const [user] = await db
    .insert(usersTable)
    .values({
      email: inv.email,
      passwordHash,
      displayName: input.displayName,
      role: inv.role,
      locale: inv.locale,
    })
    .returning();

  // Mark invitation accepted
  await db
    .update(invitationsTable)
    .set({ acceptedAt: new Date() })
    .where(eq(invitationsTable.id, inv.id));

  logger.info({ userId: user.id, email: user.email }, "User created via invitation");
  return user;
}
