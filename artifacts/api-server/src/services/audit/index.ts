/**
 * Audit log service.
 *
 * Writes append-only records to audit_log.
 * The DB table is guarded by a trigger — UPDATE and DELETE always fail.
 */
import { pool } from "@workspace/db";
import { logger } from "../../lib/logger";

export type AuditAction =
  | "auth.login_success"
  | "auth.login_failure"
  | "auth.logout"
  | "auth.password_changed"
  | "auth.password_reset_requested"
  | "auth.password_reset_completed"
  | "user.created"
  | "user.suspended"
  | "user.reactivated"
  | "user.role_changed"
  | "user.profile_updated"
  | "user.deleted"
  | "invite.created"
  | "invite.accepted"
  | "project.archived"
  | "project.deleted"
  | "file.deleted"
  | "permission.denied"
  | "dropbox.connected"
  | "dropbox.disconnected"
  | "settings.changed";

export interface AuditEvent {
  action: AuditAction;
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  meta?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

/**
 * Write a single audit event. Fire-and-forget safe — logs the error but does
 * not throw, so callers are not interrupted by an audit write failure.
 */
export async function logAudit(event: AuditEvent): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, meta, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        event.actorId ?? null,
        event.action,
        event.entityType ?? null,
        event.entityId ?? null,
        event.meta ? JSON.stringify(event.meta) : null,
        event.ipAddress ?? null,
      ]
    );
  } catch (err) {
    logger.error({ err, event }, "Failed to write audit log entry");
  }
}
