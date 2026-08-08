/**
 * Password-reset service.
 *
 * Timing-safe: responses are identical whether the email exists or not.
 * Token stored hashed; on use, all existing sessions for the user are destroyed.
 */
import crypto from "crypto";
import argon2 from "argon2";
import { db, usersTable, passwordResetTokensTable } from "@workspace/db";
import { eq, and, isNull, gt } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { deliverAccountLink } from "../../lib/mail";
import { pool } from "@workspace/db";
import { ValidationError } from "../errors";

export interface PasswordResetLinkResult {
  delivery: "console" | "smtp";
  /** Available only to a local console administrator, never SMTP callers. */
  token?: string;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const [user] = await db
    .select({ id: usersTable.id, email: usersTable.email, locale: usersTable.locale })
    .from(usersTable)
    .where(eq(usersTable.email, email));

  // Always identical response — do not reveal whether email exists
  if (!user) {
    logger.info({ email }, "Password reset requested for non-existent email");
    return;
  }

  try {
    await deliverPasswordResetLink(user);
    logger.info({ userId: user.id, email }, "Password reset requested");
  } catch (err) {
    // Do not reveal delivery failure to the public endpoint or leave a usable
    // token that was never delivered.
    logger.warn({ err, userId: user.id }, "Password reset delivery failed");
  }
}

/** Issue a reset token and deliver it, invalidating it if delivery fails. */
export async function deliverPasswordResetLink(
  user: { id: string; email: string; locale: "uk" | "cs" },
): Promise<PasswordResetLinkResult> {
  const token = await createPasswordResetToken(user.id);
  try {
    const delivery = await deliverAccountLink({
      kind: "password-reset",
      email: user.email,
      token,
      locale: user.locale,
    });
    return { delivery, ...(delivery === "console" ? { token } : {}) };
  } catch (error) {
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    await db.delete(passwordResetTokensTable).where(eq(passwordResetTokensTable.tokenHash, hash));
    throw error;
  }
}

/** Creates a token for an authenticated administrator to hand to a user once. */
export async function createPasswordResetToken(userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.insert(passwordResetTokensTable).values({
    userId,
    tokenHash,
    expiresAt,
  });

  return rawToken;
}

export async function resetPassword(
  token: string,
  newPassword: string
): Promise<string> {
  const tokenHash = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const [record] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(
      and(
        eq(passwordResetTokensTable.tokenHash, tokenHash),
        isNull(passwordResetTokensTable.usedAt),
        gt(passwordResetTokensTable.expiresAt, new Date())
      )
    );

  if (!record) throw new ValidationError("Invalid or expired reset token");

  const passwordHash = await argon2.hash(newPassword);

  // Update password and mark token used in one transaction
  await db.transaction(async (tx) => {
    await tx
      .update(usersTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(usersTable.id, record.userId));
    await tx
      .update(passwordResetTokensTable)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokensTable.id, record.id));
  });

  // Invalidate all existing sessions for this user
  await pool.query(
    `DELETE FROM sessions WHERE sess::jsonb->>'userId' = $1`,
    [record.userId]
  );

  logger.info({ userId: record.userId }, "Password reset completed — all sessions invalidated");
  return record.userId;
}
