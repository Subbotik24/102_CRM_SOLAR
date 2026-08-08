/**
 * Journal service — activity event stream + project log entries.
 *
 * Features:
 *  - Cursor-paginated, newest-first
 *  - Filters: event_type, actor_id, date_from/to, include_subprojects
 *  - Automatic event collapsing: same event_type + actor within 5 min window
 *    collapsed into a summary row (expandable). `decision` and `milestone`
 *    log entries are never collapsed.
 *  - Manual log entries (project_log_entries) interleaved by occurred_at
 */
import {
  db, activityEventsTable, usersTable,
  projectLogEntriesTable, projectsTable,
} from "@workspace/db";
import { eq, lt, lte, gte, desc, and, inArray, like, sql } from "drizzle-orm";
import type { User } from "@workspace/db";
import { ForbiddenError } from "../access";
import { hasOrganizationProjectAccess, requireProjectAccess } from "../access/projectAccess";
import { NotFoundError } from "../errors";
import { emitActivity } from "../activity";

export interface JournalEvent {
  id: string;
  kind: "activity" | "log_entry";
  projectId: string | null;
  entityType: string;
  entityId: string;
  actorId: string;
  actorName: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
  // Collapsing
  collapsed?: boolean;
  collapsedItems?: JournalEvent[];
}

export interface JournalPage {
  events: JournalEvent[];
  nextCursor: string | null;
}

const PAGE_SIZE = 50;
const COLLAPSE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const NEVER_COLLAPSE_TYPES = new Set(["decision", "milestone", "log.decision", "log.milestone"]);

// ── List journal events ───────────────────────────────────────────────────────

export async function listProjectJournal(
  actor: User,
  projectId: string,
  cursor?: string,
  options: {
    eventTypes?: string[];
    actorId?: string;
    dateFrom?: string;
    dateTo?: string;
    includeSubprojects?: boolean;
  } = {}
): Promise<JournalPage> {
  await requireProjectAccess(actor, "project:read", projectId);

  // Get the project to know its path (for subproject expansion)
  const [project] = await db
    .select({ path: projectsTable.path })
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1);

  // Resolve project IDs to include
  let projectIds = [projectId];
  if (options.includeSubprojects && project && hasOrganizationProjectAccess(actor)) {
    const subprojects = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(like(projectsTable.path, `${project.path}.%`));
    projectIds = [projectId, ...subprojects.map((s) => s.id)];
  }

  // ── Activity events ──────────────────────────────────────────────────────
  const actConditions: ReturnType<typeof eq>[] = [];

  if (cursor) {
    actConditions.push(lt(activityEventsTable.createdAt, new Date(cursor)));
  }
  if (options.dateFrom) {
    actConditions.push(gte(activityEventsTable.createdAt, new Date(options.dateFrom)));
  }
  if (options.dateTo) {
    actConditions.push(lte(activityEventsTable.createdAt, new Date(options.dateTo)));
  }
  if (options.actorId) {
    actConditions.push(eq(activityEventsTable.actorId, options.actorId));
  }
  if (options.eventTypes && options.eventTypes.length > 0) {
    actConditions.push(inArray(activityEventsTable.eventType, options.eventTypes));
  }

  const activityRows = await db
    .select({
      id: activityEventsTable.id,
      projectId: activityEventsTable.projectId,
      entityType: activityEventsTable.entityType,
      entityId: activityEventsTable.entityId,
      actorId: activityEventsTable.actorId,
      actorName: usersTable.displayName,
      eventType: activityEventsTable.eventType,
      payload: activityEventsTable.payload,
      createdAt: activityEventsTable.createdAt,
    })
    .from(activityEventsTable)
    .innerJoin(usersTable, eq(activityEventsTable.actorId, usersTable.id))
    .where(
      and(
        inArray(activityEventsTable.projectId, projectIds),
        ...actConditions
      )
    )
    .orderBy(desc(activityEventsTable.createdAt))
    .limit(PAGE_SIZE * 2);

  // ── Log entries ──────────────────────────────────────────────────────────
  const logConditions: ReturnType<typeof eq>[] = [
    sql`${projectLogEntriesTable.deletedAt} IS NULL`,
  ];

  if (cursor) {
    logConditions.push(lt(projectLogEntriesTable.occurredAt, new Date(cursor)));
  }
  if (options.dateFrom) {
    logConditions.push(gte(projectLogEntriesTable.occurredAt, new Date(options.dateFrom)));
  }
  if (options.dateTo) {
    logConditions.push(lte(projectLogEntriesTable.occurredAt, new Date(options.dateTo)));
  }
  if (options.actorId) {
    logConditions.push(eq(projectLogEntriesTable.actorId, options.actorId));
  }

  const logRows = await db
    .select({
      id: projectLogEntriesTable.id,
      projectId: projectLogEntriesTable.projectId,
      actorId: projectLogEntriesTable.actorId,
      actorName: usersTable.displayName,
      entryType: projectLogEntriesTable.entryType,
      title: projectLogEntriesTable.title,
      bodyMd: projectLogEntriesTable.bodyMd,
      occurredAt: projectLogEntriesTable.occurredAt,
    })
    .from(projectLogEntriesTable)
    .innerJoin(usersTable, eq(projectLogEntriesTable.actorId, usersTable.id))
    .where(
      and(
        inArray(projectLogEntriesTable.projectId, projectIds),
        ...logConditions
      )
    )
    .orderBy(desc(projectLogEntriesTable.occurredAt))
    .limit(PAGE_SIZE);

  // ── Merge + sort by date ─────────────────────────────────────────────────
  const activityEvents: JournalEvent[] = activityRows.map((r) => ({
    id: r.id,
    kind: "activity" as const,
    projectId: r.projectId ?? null,
    entityType: r.entityType,
    entityId: r.entityId,
    actorId: r.actorId,
    actorName: r.actorName,
    eventType: r.eventType,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    createdAt: r.createdAt.toISOString(),
  }));

  const logEvents: JournalEvent[] = logRows.map((r) => ({
    id: r.id,
    kind: "log_entry" as const,
    projectId: r.projectId,
    entityType: "log_entry",
    entityId: r.id,
    actorId: r.actorId,
    actorName: r.actorName,
    eventType: `log.${r.entryType}`,
    payload: { title: r.title, bodyMd: r.bodyMd, entryType: r.entryType },
    createdAt: r.occurredAt.toISOString(),
  }));

  const merged = [...activityEvents, ...logEvents]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, PAGE_SIZE + 1);

  const hasNextPage = merged.length > PAGE_SIZE;
  const items = hasNextPage ? merged.slice(0, PAGE_SIZE) : merged;

  // ── Collapse runs ────────────────────────────────────────────────────────
  const collapsed = collapseRuns(items);

  return {
    events: collapsed,
    nextCursor: hasNextPage ? items[items.length - 1].createdAt : null,
  };
}

/**
 * Collapse consecutive events by the same actor with the same eventType
 * within a 5-minute window into a single summary row.
 * decision, milestone, log.decision, log.milestone are never collapsed.
 */
function collapseRuns(events: JournalEvent[]): JournalEvent[] {
  const result: JournalEvent[] = [];

  for (const ev of events) {
    const neverCollapse = NEVER_COLLAPSE_TYPES.has(ev.eventType) || ev.kind === "log_entry";
    const last = result[result.length - 1];

    if (
      !neverCollapse &&
      last &&
      !NEVER_COLLAPSE_TYPES.has(last.eventType) &&
      last.actorId === ev.actorId &&
      last.eventType === ev.eventType &&
      Math.abs(new Date(last.createdAt).getTime() - new Date(ev.createdAt).getTime()) <= COLLAPSE_WINDOW_MS
    ) {
      // Merge into existing collapsed group
      if (!last.collapsed) {
        last.collapsed = true;
        last.collapsedItems = [{ ...last }];
      }
      last.collapsedItems!.push(ev);
    } else {
      result.push({ ...ev });
    }
  }

  return result;
}

// ── Log entry CRUD ────────────────────────────────────────────────────────────

export async function listLogEntries(actor: User, projectId: string) {
  await requireProjectAccess(actor, "project:read", projectId);
  if (actor.role === "guest") {
    throw new ForbiddenError("Guests cannot read project log entries");
  }
  return db
    .select({
      id: projectLogEntriesTable.id,
      projectId: projectLogEntriesTable.projectId,
      actorId: projectLogEntriesTable.actorId,
      actorName: usersTable.displayName,
      entryType: projectLogEntriesTable.entryType,
      title: projectLogEntriesTable.title,
      bodyMd: projectLogEntriesTable.bodyMd,
      occurredAt: projectLogEntriesTable.occurredAt,
      createdAt: projectLogEntriesTable.createdAt,
    })
    .from(projectLogEntriesTable)
    .innerJoin(usersTable, eq(projectLogEntriesTable.actorId, usersTable.id))
    .where(and(eq(projectLogEntriesTable.projectId, projectId), sql`${projectLogEntriesTable.deletedAt} IS NULL`))
    .orderBy(desc(projectLogEntriesTable.occurredAt));
}

export async function createLogEntry(
  actor: User,
  {
    projectId,
    entryType,
    title,
    bodyMd = "",
    occurredAt,
  }: {
    projectId: string;
    entryType: "decision" | "milestone" | "risk" | "note";
    title: string;
    bodyMd?: string;
    occurredAt?: string;
  }
) {
  await requireProjectAccess(actor, "project:update", projectId);
  if (actor.role !== "admin" && actor.role !== "manager") {
    throw new ForbiddenError("Only managers and administrators can create log entries");
  }

  return db.transaction(async (tx) => {
    const [entry] = await tx
      .insert(projectLogEntriesTable)
      .values({
        projectId,
        actorId: actor.id,
        entryType,
        title,
        bodyMd,
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      })
      .returning();
    await emitActivity(tx, {
      projectId,
      entityType: "log_entry",
      entityId: entry.id,
      actorId: actor.id,
      eventType: `log.${entryType}.created`,
      payload: { entryType, title },
    });
    return entry;
  });
}

export async function updateLogEntry(
  actor: User,
  entryId: string,
  updates: { title?: string; bodyMd?: string; entryType?: string; occurredAt?: string }
) {
  if (actor.role !== "admin" && actor.role !== "manager") {
    throw new ForbiddenError("Only managers and administrators can update log entries");
  }

  const [existing] = await db
    .select()
    .from(projectLogEntriesTable)
    .where(eq(projectLogEntriesTable.id, entryId))
    .limit(1);
  if (!existing) throw new NotFoundError("Log entry not found");
  await requireProjectAccess(actor, "project:update", existing.projectId);

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(projectLogEntriesTable)
      .set({
        title: updates.title ?? existing.title,
        bodyMd: updates.bodyMd ?? existing.bodyMd,
        entryType: (updates.entryType as typeof existing.entryType) ?? existing.entryType,
        occurredAt: updates.occurredAt ? new Date(updates.occurredAt) : existing.occurredAt,
        updatedAt: new Date(),
      })
      .where(eq(projectLogEntriesTable.id, entryId))
      .returning();
    await emitActivity(tx, {
      projectId: existing.projectId,
      entityType: "log_entry",
      entityId: updated.id,
      actorId: actor.id,
      eventType: `log.${updated.entryType}.updated`,
      payload: { entryType: updated.entryType, title: updated.title },
    });
    return updated;
  });
}

export async function deleteLogEntry(actor: User, entryId: string) {
  if (actor.role !== "admin" && actor.role !== "manager") {
    throw new ForbiddenError("Only managers and administrators can delete log entries");
  }

  const [existing] = await db
    .select()
    .from(projectLogEntriesTable)
    .where(eq(projectLogEntriesTable.id, entryId))
    .limit(1);
  if (!existing || existing.deletedAt) throw new NotFoundError("Log entry not found");
  await requireProjectAccess(actor, "project:update", existing.projectId);
  await db.transaction(async (tx) => {
    await tx
      .update(projectLogEntriesTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(projectLogEntriesTable.id, entryId));
    await emitActivity(tx, {
      projectId: existing.projectId,
      entityType: "log_entry",
      entityId: entryId,
      actorId: actor.id,
      eventType: `log.${existing.entryType}.deleted`,
      payload: { entryType: existing.entryType, title: existing.title },
    });
  });
}
