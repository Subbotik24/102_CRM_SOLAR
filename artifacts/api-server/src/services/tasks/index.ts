import { db, tasksTable, activityEventsTable, projectsTable, projectStagesTable, deletionRequestsTable } from "@workspace/db";
    import { count, eq, and, isNull, like, inArray, asc, sql } from "drizzle-orm";
    import type { User, Task, Project } from "@workspace/db";
    import { authorize } from "../access";
    import { hasOrganizationProjectAccess, requireProjectAccess } from "../access/projectAccess";
    import { createTaskAssignedNotification } from "../notifications";
    import { z } from "zod";
    import { NotFoundError, ValidationError } from "../errors";

    export { type Task };

    export const taskStatusValues = [
    "todo",
    "in_progress",
    "blocked",
    "review",
    "done",
    ] as const;
    export type TaskStatus = (typeof taskStatusValues)[number];

    export const createTaskSchema = z.object({
    title: z.string().min(1).max(200),
    descriptionMd: z.string().optional(),
    priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    assigneeId: z.string().uuid().optional(),
    dueAt: z.string().datetime().optional(),
    parentTaskId: z.string().uuid().optional(),
    stageId: z.string().uuid().optional(),
    });

    export const updateTaskSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    descriptionMd: z.string().optional().nullable(),
    priority: z.enum(["low", "medium", "high", "critical"]).optional(),
    assigneeId: z.string().uuid().optional().nullable(),
    dueAt: z.string().datetime().optional().nullable(),
    stageId: z.string().uuid().optional().nullable(),
    position: z.number().int().min(0).optional(),
    });

    export const updateTaskStatusSchema = z.object({
    status: z.enum(taskStatusValues),
    });

    export const listTasksQuerySchema = z.object({
    status: z.enum(taskStatusValues).optional(),
    priority: z.enum(["low", "medium", "high", "critical"]).optional(),
    assigneeId: z.string().uuid().optional(),
    stageId: z.string().uuid().optional(),
    parentTaskId: z.string().uuid().optional(),
    rootOnly: z.boolean().optional(), // only top-level tasks (no parent)
    limit: z.number().int().min(1).max(200).default(100),
    offset: z.number().int().min(0).default(0),
    includeSubprojects: z.boolean().optional(), // also include tasks from descendant projects
    });

    export type CreateTaskInput = z.infer<typeof createTaskSchema>;
    export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
    export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

    async function generateTaskCode(
    projectId: string,
    projectCode: string
    ): Promise<string> {
    const [{ value: taskCount }] = await db
      .select({ value: count() })
      .from(tasksTable)
      .where(eq(tasksTable.projectId, projectId));
    const num = Number(taskCount) + 1;
    return `${projectCode}-${num}`;
    }

    export async function createTask(
    actor: User,
    project: Project,
    input: CreateTaskInput
    ): Promise<Task> {
    await requireProjectAccess(actor, "task:create", project.id);

    const data = createTaskSchema.parse(input);
    const code = await generateTaskCode(project.id, project.code);

    let taskPath = `${project.id}.${code}`;
    let depth = 0;

    if (data.parentTaskId) {
      const parentTask = await getTaskById(data.parentTaskId);
      if (!parentTask) throw new NotFoundError("Parent task not found");
      if (parentTask.projectId !== project.id)
        throw new ValidationError("Parent task belongs to a different project");
      if (parentTask.depth >= 2) throw new ValidationError("Maximum subtask nesting depth (2) exceeded");
      taskPath = `${parentTask.path}.${code}`;
      depth = parentTask.depth + 1;
    }

    if (data.stageId) {
      const [stage] = await db
        .select({ id: projectStagesTable.id })
        .from(projectStagesTable)
        .where(eq(projectStagesTable.id, data.stageId))
        .limit(1);
      if (!stage) throw new NotFoundError("Stage not found");
      const [stageProject] = await db
        .select({ projectId: projectStagesTable.projectId })
        .from(projectStagesTable)
        .where(eq(projectStagesTable.id, data.stageId))
        .limit(1);
      if (stageProject?.projectId !== project.id)
        throw new ValidationError("Stage belongs to a different project");
    }

    return db.transaction(async (tx) => {
      const [task] = await tx
        .insert(tasksTable)
        .values({
          projectId: project.id,
          parentTaskId: data.parentTaskId ?? null,
          path: taskPath,
          depth,
          code,
          title: data.title,
          descriptionMd: data.descriptionMd ?? null,
          status: "todo",
          priority: data.priority,
          assigneeId: data.assigneeId ?? null,
          stageId: data.stageId ?? null,
          dueAt: data.dueAt ? new Date(data.dueAt) : null,
          position: 0,
        })
        .returning();

      await tx.insert(activityEventsTable).values({
        projectId: project.id,
        entityType: "task",
        entityId: task.id,
        actorId: actor.id,
        eventType: "task.created",
        payload: {
          taskId: task.id,
          taskCode: task.code,
          taskTitle: task.title,
        },
      });

      return task;
    });
    }

    export async function getTaskById(id: string): Promise<Task | null> {
    const [task] = await db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.id, id))
      .limit(1);
    return task ?? null;
    }

    /** User-facing task lookup: unavailable project resources are indistinguishable from absent IDs. */
    export async function getTaskForActor(actor: User, id: string): Promise<Task | null> {
    const task = await getTaskById(id);
    if (!task) return null;
    try {
      await requireProjectAccess(actor, "task:read", task.projectId);
      return task;
    } catch {
      return null;
    }
    }

    export interface TaskWithProject {
    id: string;
    projectId: string;
    code: string;
    title: string;
    status: (typeof taskStatusValues)[number];
    priority: "low" | "medium" | "high" | "critical";
    assigneeId: string | null;
    dueAt: Date | null;
    stageId: string | null;
    parentTaskId: string | null;
    depth: number;
    position: number;
    descriptionMd: string | null;
    archivedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    projectName: string;
    projectCode: string;
    pendingDeletion: { id: string; requestedById: string } | null;
    }

    /** Bulk-lookup pending deletion requests for a set of tasks. */
    async function getPendingDeletionsFor(
    taskIds: string[]
    ): Promise<Map<string, { id: string; requestedById: string }>> {
    if (taskIds.length === 0) return new Map();
    const rows = await db
      .select({
        id: deletionRequestsTable.id,
        entityId: deletionRequestsTable.entityId,
        requestedById: deletionRequestsTable.requestedById,
      })
      .from(deletionRequestsTable)
      .where(
        and(
          eq(deletionRequestsTable.entityType, "task"),
          eq(deletionRequestsTable.status, "pending"),
          inArray(deletionRequestsTable.entityId, taskIds)
        )
      );
    return new Map(rows.map((r) => [r.entityId, { id: r.id, requestedById: r.requestedById }]));
    }

    /** Pending deletion request for a single task, if any. */
    export async function getTaskPendingDeletion(
    taskId: string
    ): Promise<{ id: string; requestedById: string } | null> {
    const map = await getPendingDeletionsFor([taskId]);
    return map.get(taskId) ?? null;
    }

    export async function listAllTasks(
    actor: User,
    query?: { assigneeId?: string; status?: string; limit?: number }
    ): Promise<TaskWithProject[]> {
    authorize(actor, "task:read");
    const conditions: ReturnType<typeof eq>[] = [];
    if (query?.assigneeId) conditions.push(eq(tasksTable.assigneeId, query.assigneeId));
    if (query?.status) conditions.push(eq(tasksTable.status, query.status as (typeof taskStatusValues)[number]));

    const rows = await db
      .select({
        id: tasksTable.id,
        projectId: tasksTable.projectId,
        code: tasksTable.code,
        title: tasksTable.title,
        status: tasksTable.status,
        priority: tasksTable.priority,
        assigneeId: tasksTable.assigneeId,
        dueAt: tasksTable.dueAt,
        stageId: tasksTable.stageId,
        parentTaskId: tasksTable.parentTaskId,
        depth: tasksTable.depth,
        position: tasksTable.position,
        descriptionMd: tasksTable.descriptionMd,
        archivedAt: tasksTable.archivedAt,
        completedAt: tasksTable.completedAt,
        createdAt: tasksTable.createdAt,
        updatedAt: tasksTable.updatedAt,
        projectName: projectsTable.name,
        projectCode: projectsTable.code,
      })
      .from(tasksTable)
      .innerJoin(projectsTable, eq(tasksTable.projectId, projectsTable.id))
      .where(and(
        conditions.length > 0 ? and(...conditions) : undefined,
        hasOrganizationProjectAccess(actor) ? undefined : sql`EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = ${tasksTable.projectId} AND pm.user_id = ${actor.id})`,
      ))
      .orderBy(tasksTable.dueAt, tasksTable.createdAt)
      .limit(query?.limit ?? 50);

    const pending = await getPendingDeletionsFor(rows.map((r) => r.id));
    return rows.map((r) => ({ ...r, pendingDeletion: pending.get(r.id) ?? null }));
    }

    export interface ListProjectTasksResult {
    tasks: TaskWithProject[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    }

    export async function listProjectTasks(
    actor: User,
    projectId: string,
    query?: ListTasksQuery
    ): Promise<ListProjectTasksResult> {
    await requireProjectAccess(actor, "task:read", projectId);

    // A project's own tasks, plus — when requested — every descendant
    // project's tasks, resolved via the materialized `path` prefix (same
    // pattern as listProjectJournal's includeSubprojects).
    let projectIds: string[] = [projectId];
    if (query?.includeSubprojects && hasOrganizationProjectAccess(actor)) {
      const [project] = await db
        .select({ path: projectsTable.path })
        .from(projectsTable)
        .where(eq(projectsTable.id, projectId))
        .limit(1);
      if (project) {
        const descendants = await db
          .select({ id: projectsTable.id })
          .from(projectsTable)
          .where(like(projectsTable.path, `${project.path}.%`));
        projectIds = [projectId, ...descendants.map((d) => d.id)];
      }
    }

    const conditions = [
      projectIds.length > 1
        ? inArray(tasksTable.projectId, projectIds)
        : eq(tasksTable.projectId, projectId),
    ];

    if (query?.status) conditions.push(eq(tasksTable.status, query.status));
    if (query?.priority) conditions.push(eq(tasksTable.priority, query.priority));
    if (query?.assigneeId) conditions.push(eq(tasksTable.assigneeId, query.assigneeId));
    if (query?.stageId) conditions.push(eq(tasksTable.stageId, query.stageId));
    if (query?.parentTaskId) conditions.push(eq(tasksTable.parentTaskId, query.parentTaskId));
    if (query?.rootOnly) conditions.push(isNull(tasksTable.parentTaskId));

    const where = and(...conditions);

    const [{ value: total }] = await db
      .select({ value: count() })
      .from(tasksTable)
      .where(where);

    let builder = db
      .select({
        id: tasksTable.id,
        projectId: tasksTable.projectId,
        code: tasksTable.code,
        title: tasksTable.title,
        status: tasksTable.status,
        priority: tasksTable.priority,
        assigneeId: tasksTable.assigneeId,
        dueAt: tasksTable.dueAt,
        stageId: tasksTable.stageId,
        parentTaskId: tasksTable.parentTaskId,
        depth: tasksTable.depth,
        position: tasksTable.position,
        descriptionMd: tasksTable.descriptionMd,
        archivedAt: tasksTable.archivedAt,
        completedAt: tasksTable.completedAt,
        createdAt: tasksTable.createdAt,
        updatedAt: tasksTable.updatedAt,
        projectName: projectsTable.name,
        projectCode: projectsTable.code,
      })
      .from(tasksTable)
      .innerJoin(projectsTable, eq(tasksTable.projectId, projectsTable.id))
      .where(where)
      .orderBy(asc(tasksTable.position), asc(tasksTable.createdAt), asc(tasksTable.id))
      .$dynamic();

    const limit = query?.limit ?? 100;
    const offset = query?.offset ?? 0;
    builder = builder.limit(limit).offset(offset);

    const tasks = await builder;
    const pending = await getPendingDeletionsFor(tasks.map((t) => t.id));
    return {
      tasks: tasks.map((t) => ({ ...t, pendingDeletion: pending.get(t.id) ?? null })),
      total: Number(total),
      limit,
      offset,
      hasMore: offset + tasks.length < Number(total),
    };
    }

    export async function updateTask(
    actor: User,
    taskId: string,
    input: UpdateTaskInput
    ): Promise<Task | null> {
    const data = updateTaskSchema.parse(input);

    const [existing] = await db
      .select({ task: tasksTable, projectCode: projectsTable.code })
      .from(tasksTable)
      .innerJoin(projectsTable, eq(tasksTable.projectId, projectsTable.id))
      .where(eq(tasksTable.id, taskId))
      .limit(1);

    if (!existing) return null;
    await requireProjectAccess(actor, "task:update", existing.task.projectId);

    // Validate stageId belongs to the same project before updating
    if (data.stageId) {
      const [stage] = await db
        .select({ projectId: projectStagesTable.projectId })
        .from(projectStagesTable)
        .where(eq(projectStagesTable.id, data.stageId))
        .limit(1);
      if (!stage) throw new NotFoundError("Stage not found");
      if (stage.projectId !== existing.task.projectId)
        throw new ValidationError("Stage belongs to a different project");
    }

    const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];

    if (data.assigneeId !== undefined && data.assigneeId !== existing.task.assigneeId) {
      events.push({
        eventType: "task.assignee_changed",
        payload: {
          taskId,
          taskCode: existing.task.code,
          from: existing.task.assigneeId,
          to: data.assigneeId,
        },
      });
      // Fire notification for the new assignee (non-blocking, outside transaction)
      if (data.assigneeId) {
        createTaskAssignedNotification(
          actor,
          data.assigneeId,
          taskId,
          existing.task.title
        ).catch(() => null);
      }
    }

    if (data.dueAt !== undefined) {
      const newDue = data.dueAt ? new Date(data.dueAt).toISOString() : null;
      const oldDue = existing.task.dueAt ? existing.task.dueAt.toISOString() : null;
      if (newDue !== oldDue) {
        events.push({
          eventType: "task.due_changed",
          payload: {
            taskId,
            taskCode: existing.task.code,
            from: oldDue,
            to: newDue,
          },
        });
      }
    }

    return db.transaction(async (tx) => {
      const [updated] = await tx
        .update(tasksTable)
        .set({
          ...data,
          dueAt: data.dueAt !== undefined ? (data.dueAt ? new Date(data.dueAt) : null) : undefined,
          updatedAt: new Date(),
        })
        .where(eq(tasksTable.id, taskId))
        .returning();

      for (const ev of events) {
        await tx.insert(activityEventsTable).values({
          projectId: existing.task.projectId,
          entityType: "task",
          entityId: taskId,
          actorId: actor.id,
          eventType: ev.eventType,
          payload: ev.payload,
        });
      }

      return updated;
    });
    }

    export async function updateTaskStatus(
    actor: User,
    taskId: string,
    newStatus: TaskStatus
    ): Promise<Task | null> {
    const [existing] = await db
      .select({ task: tasksTable, projectCode: projectsTable.code })
      .from(tasksTable)
      .innerJoin(projectsTable, eq(tasksTable.projectId, projectsTable.id))
      .where(eq(tasksTable.id, taskId))
      .limit(1);

    if (!existing) return null;
    await requireProjectAccess(actor, "task:update", existing.task.projectId);

    const { task, projectCode: _projectCode } = existing;
    const fromStatus = task.status;

    return db.transaction(async (tx) => {
      const completedAt = newStatus === "done" ? new Date() : null;

      const [updated] = await tx
        .update(tasksTable)
        .set({ status: newStatus, completedAt, updatedAt: new Date() })
        .where(eq(tasksTable.id, taskId))
        .returning();

      await tx.insert(activityEventsTable).values({
        projectId: updated.projectId,
        entityType: "task",
        entityId: updated.id,
        actorId: actor.id,
        eventType: "task.status_changed",
        payload: {
          taskId: updated.id,
          taskCode: updated.code,
          taskTitle: updated.title,
          from: fromStatus,
          to: newStatus,
        },
      });

      return updated;
    });
    }

    export async function deleteTask(
    actor: User,
    taskId: string
    ): Promise<void> {
    // Fetch the task to get its path prefix
    const [task] = await db
      .select({ path: tasksTable.path, projectId: tasksTable.projectId })
      .from(tasksTable)
      .where(eq(tasksTable.id, taskId))
      .limit(1);
    if (!task) return;
    await requireProjectAccess(actor, "task:delete", task.projectId);
    // Delete all descendants first (path starts with "<taskPath>.") then the task itself.
    // The activity write is deliberately part of the same database transaction.
    await db.transaction(async (tx) => {
      await tx.delete(tasksTable).where(like(tasksTable.path, `${task.path}.%`));
      await tx.delete(tasksTable).where(eq(tasksTable.id, taskId));
      await tx.insert(activityEventsTable).values({
        projectId: task.projectId,
        entityType: "task",
        entityId: taskId,
        actorId: actor.id,
        eventType: "task.deleted",
        payload: { taskId },
      });
    });
    }

    export async function archiveTask(
    actor: User,
    taskId: string
    ): Promise<Task | null> {
    const [existing] = await db.select({ projectId: tasksTable.projectId }).from(tasksTable).where(eq(tasksTable.id, taskId)).limit(1);
    if (!existing) return null;
    await requireProjectAccess(actor, "task:update", existing.projectId);
    return db.transaction(async (tx) => {
      const [updated] = await tx
        .update(tasksTable)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(tasksTable.id, taskId))
        .returning();
      if (!updated) return null;
      await tx.insert(activityEventsTable).values({
        projectId: existing.projectId,
        entityType: "task",
        entityId: updated.id,
        actorId: actor.id,
        eventType: "task.archived",
        payload: { taskId: updated.id, taskCode: updated.code, taskTitle: updated.title },
      });
      return updated;
    });
    }
