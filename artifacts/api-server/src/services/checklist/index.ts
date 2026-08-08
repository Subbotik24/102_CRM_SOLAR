    import { db, checklistItemsTable, tasksTable } from "@workspace/db";
    import { eq, asc, max } from "drizzle-orm";
    import type { User, ChecklistItem } from "@workspace/db";
    import { requireProjectAccess } from "../access/projectAccess";
    import { z } from "zod";

    export { type ChecklistItem };

    export const createChecklistItemSchema = z.object({
    title: z.string().min(1).max(500),
    });

    export const updateChecklistItemSchema = z.object({
    title: z.string().min(1).max(500).optional(),
    });

    export async function listChecklistItems(
    actor: User,
    taskId: string
    ): Promise<ChecklistItem[]> {
    const [task] = await db.select({ projectId: tasksTable.projectId }).from(tasksTable).where(eq(tasksTable.id, taskId)).limit(1);
    if (!task) return [];
    await requireProjectAccess(actor, "task:read", task.projectId);
    return db
      .select()
      .from(checklistItemsTable)
      .where(eq(checklistItemsTable.taskId, taskId))
      .orderBy(asc(checklistItemsTable.position));
    }

    export async function createChecklistItem(
    actor: User,
    taskId: string,
    input: z.infer<typeof createChecklistItemSchema>
    ): Promise<ChecklistItem> {
    const [task] = await db.select({ projectId: tasksTable.projectId }).from(tasksTable).where(eq(tasksTable.id, taskId)).limit(1);
    if (!task) throw new Error("Task not found");
    await requireProjectAccess(actor, "task:update", task.projectId);
    const data = createChecklistItemSchema.parse(input);

    const [{ maxPos }] = await db
      .select({ maxPos: max(checklistItemsTable.position) })
      .from(checklistItemsTable)
      .where(eq(checklistItemsTable.taskId, taskId));

    const position = (maxPos ?? -1) + 1;

    const [item] = await db
      .insert(checklistItemsTable)
      .values({ taskId, title: data.title, position })
      .returning();

    return item;
    }

    export async function updateChecklistItem(
    actor: User,
    itemId: string,
    input: z.infer<typeof updateChecklistItemSchema>
    ): Promise<ChecklistItem | null> {
    const data = updateChecklistItemSchema.parse(input);
    const [existing] = await db.select({ taskId: checklistItemsTable.taskId }).from(checklistItemsTable).where(eq(checklistItemsTable.id, itemId)).limit(1);
    if (!existing) return null;
    const [task] = await db.select({ projectId: tasksTable.projectId }).from(tasksTable).where(eq(tasksTable.id, existing.taskId)).limit(1);
    if (!task) return null;
    await requireProjectAccess(actor, "task:update", task.projectId);
    const [updated] = await db
      .update(checklistItemsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(checklistItemsTable.id, itemId))
      .returning();
    return updated ?? null;
    }

    export async function toggleChecklistItem(
    actor: User,
    itemId: string
    ): Promise<ChecklistItem | null> {
    const [existing] = await db
      .select()
      .from(checklistItemsTable)
      .where(eq(checklistItemsTable.id, itemId))
      .limit(1);
    if (!existing) return null;
    const [task] = await db.select({ projectId: tasksTable.projectId }).from(tasksTable).where(eq(tasksTable.id, existing.taskId)).limit(1);
    if (!task) return null;
    await requireProjectAccess(actor, "task:update", task.projectId);
    const [updated] = await db
      .update(checklistItemsTable)
      .set({
        completedAt: existing.completedAt ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(checklistItemsTable.id, itemId))
      .returning();
    return updated;
    }

    export async function deleteChecklistItem(
    actor: User,
    itemId: string
    ): Promise<void> {
    const [existing] = await db.select({ taskId: checklistItemsTable.taskId }).from(checklistItemsTable).where(eq(checklistItemsTable.id, itemId)).limit(1);
    if (!existing) return;
    const [task] = await db.select({ projectId: tasksTable.projectId }).from(tasksTable).where(eq(tasksTable.id, existing.taskId)).limit(1);
    if (!task) return;
    await requireProjectAccess(actor, "task:update", task.projectId);
    await db.delete(checklistItemsTable).where(eq(checklistItemsTable.id, itemId));
    }
