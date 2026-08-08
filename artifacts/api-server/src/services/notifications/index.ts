import { db, notificationsTable, usersTable, tasksTable } from "@workspace/db";
import { eq, and, isNull, desc, ilike, asc, lte, ne } from "drizzle-orm";
import type { User, Notification } from "@workspace/db";
import { authorize } from "../access";

export { type Notification };

export interface DueTask {
  id: string;
  code: string;
  title: string;
  projectId: string;
  dueAt: Date;
  kind: "task_due_today" | "task_overdue";
}

/**
 * Tasks assigned to the actor that are due today or already overdue.
 * Computed at read time from tasksTable rather than persisted as
 * notification rows — there is no scheduler in this app, so a stored
 * "due" notification would never refresh itself as time passes. This
 * always reflects the current moment and needs no background job.
 */
export async function listDueTasksForUser(actor: User): Promise<DueTask[]> {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const rows = await db
    .select({
      id: tasksTable.id,
      code: tasksTable.code,
      title: tasksTable.title,
      projectId: tasksTable.projectId,
      dueAt: tasksTable.dueAt,
    })
    .from(tasksTable)
    .where(
      and(
        eq(tasksTable.assigneeId, actor.id),
        ne(tasksTable.status, "done"),
        isNull(tasksTable.archivedAt),
        lte(tasksTable.dueAt, endOfToday)
      )
    )
    .orderBy(asc(tasksTable.dueAt));

  const now = new Date();
  return rows
    .filter((r): r is typeof r & { dueAt: Date } => r.dueAt !== null)
    .map((r) => ({
      ...r,
      kind: r.dueAt < new Date(now.getFullYear(), now.getMonth(), now.getDate())
        ? ("task_overdue" as const)
        : ("task_due_today" as const),
    }));
}

/** Parse @mention patterns from markdown and return user display names */
function parseMentions(bodyMd: string): string[] {
  const matches = bodyMd.match(/@(\w[\w.-]*)/g) ?? [];
  return matches.map((m) => m.slice(1));
}

/** Find users by display name (match @mention token against displayName words) */
async function resolveUsersByMention(names: string[]): Promise<{ id: string }[]> {
  if (names.length === 0) return [];
  const rows = await db
    .select({ id: usersTable.id, displayName: usersTable.displayName })
    .from(usersTable);
  return rows.filter((u) =>
    names.some((n) => u.displayName.toLowerCase().includes(n.toLowerCase()))
  );
}

/** Create mention notifications for users referenced in a body of text */
export async function createNotificationsForMentions(
  actor: User,
  bodyMd: string,
  entity: { entityType: string; entityId: string }
): Promise<void> {
  const names = parseMentions(bodyMd);
  if (names.length === 0) return;

  const users = await resolveUsersByMention(names);
  const targets = users.filter((u) => u.id !== actor.id);
  if (targets.length === 0) return;

  await db.insert(notificationsTable).values(
    targets.map((u) => ({
      userId: u.id,
      kind: "mention",
      actorId: actor.id,
      entityType: entity.entityType,
      entityId: entity.entityId,
      payload: JSON.stringify({ mentionedIn: entity.entityType }),
    }))
  );
}

/** Create a notification for task assignment */
export async function createTaskAssignedNotification(
  actor: User,
  assigneeId: string,
  taskId: string,
  taskTitle: string
): Promise<void> {
  if (assigneeId === actor.id) return;
  await db.insert(notificationsTable).values({
    userId: assigneeId,
    kind: "task_assigned",
    actorId: actor.id,
    entityType: "task",
    entityId: taskId,
    payload: JSON.stringify({ taskTitle }),
  });
}

/** Create new-message notifications for conversation members */
export async function createNewMessageNotifications(
  actor: User,
  conversationId: string,
  memberIds: string[],
  bodyMd: string
): Promise<void> {
  const targets = memberIds.filter((id) => id !== actor.id);
  if (targets.length === 0) return;

  await db.insert(notificationsTable).values(
    targets.map((userId) => ({
      userId,
      kind: "new_message",
      actorId: actor.id,
      entityType: "conversation",
      entityId: conversationId,
      payload: JSON.stringify({ preview: bodyMd.slice(0, 100) }),
    }))
  );

  // Also handle @mentions
  await createNotificationsForMentions(actor, bodyMd, {
    entityType: "conversation",
    entityId: conversationId,
  });
}

/** Notify every admin user (used for deletion-approval requests). */
export async function notifyAdmins(
  actor: User,
  kind: string,
  entity: { entityType: string; entityId: string },
  payload: Record<string, unknown>
): Promise<void> {
  const admins = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "admin"));

  const targets = admins.filter((a) => a.id !== actor.id);
  if (targets.length === 0) return;

  await db.insert(notificationsTable).values(
    targets.map((a) => ({
      userId: a.id,
      kind,
      actorId: actor.id,
      entityType: entity.entityType,
      entityId: entity.entityId,
      payload: JSON.stringify(payload),
    }))
  );
}

export async function listNotifications(
  actor: User,
  limit = 50
): Promise<Notification[]> {
  return db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, actor.id))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limit);
}

export async function countUnreadNotifications(actor: User): Promise<number> {
  const rows = await db
    .select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, actor.id),
        isNull(notificationsTable.readAt)
      )
    );
  return rows.length;
}

export async function markNotificationRead(
  actor: User,
  notificationId: string
): Promise<void> {
  await db
    .update(notificationsTable)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notificationsTable.id, notificationId),
        eq(notificationsTable.userId, actor.id)
      )
    );
}

export async function markAllNotificationsRead(actor: User): Promise<void> {
  await db
    .update(notificationsTable)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notificationsTable.userId, actor.id),
        isNull(notificationsTable.readAt)
      )
    );
}

export async function mentionSearch(
  actor: User,
  q: string
): Promise<{ id: string; username: string | null; displayName: string }[]> {
  // Mentions belong to chat and comments; guests have neither, and must not be
  // able to enumerate the user directory. Previously `actor` was accepted and
  // never checked, so any authenticated user — including a guest — could list
  // every user's id and display name.
  authorize(actor, "chat:read");

  // Filter in SQL. Fetching a fixed 50 rows and filtering in memory meant the
  // search only ever looked at an arbitrary first 50 users.
  const rows = await db
    .select({
      id: usersTable.id,
      displayName: usersTable.displayName,
    })
    .from(usersTable)
    .where(q ? ilike(usersTable.displayName, `%${q}%`) : undefined)
    .orderBy(asc(usersTable.displayName))
    .limit(10);

  return rows.map((u) => ({
    id: u.id,
    username: null,
    displayName: u.displayName,
  }));
}
