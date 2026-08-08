import { db, projectStagesTable } from "@workspace/db";
    import { eq, asc, max } from "drizzle-orm";
    import type { User, ProjectStage } from "@workspace/db";
    import { requireProjectAccess } from "../access/projectAccess";
    import { z } from "zod";
    import { emitActivity } from "../activity";

    export { type ProjectStage };

    export const createStageSchema = z.object({
    name: z.string().min(1).max(200),
    color: z.string().optional(),
    });

    export const updateStageSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    color: z.string().optional().nullable(),
    });

    export const reorderStagesSchema = z.object({
    orderedIds: z.array(z.string().uuid()),
    });

    export type CreateStageInput = z.infer<typeof createStageSchema>;
    export type UpdateStageInput = z.infer<typeof updateStageSchema>;

    export async function listStages(
    actor: User,
    projectId: string
    ): Promise<ProjectStage[]> {
    await requireProjectAccess(actor, "project:read", projectId);
    return db
      .select()
      .from(projectStagesTable)
      .where(eq(projectStagesTable.projectId, projectId))
      .orderBy(asc(projectStagesTable.position));
    }

    export async function createStage(
    actor: User,
    projectId: string,
    input: CreateStageInput
    ): Promise<ProjectStage> {
    await requireProjectAccess(actor, "project:update", projectId);
    const data = createStageSchema.parse(input);

    const [{ maxPos }] = await db
      .select({ maxPos: max(projectStagesTable.position) })
      .from(projectStagesTable)
      .where(eq(projectStagesTable.projectId, projectId));

    const position = (maxPos ?? -1) + 1;

    return db.transaction(async (tx) => {
      const [stage] = await tx
        .insert(projectStagesTable)
        .values({ projectId, name: data.name, color: data.color ?? null, position })
        .returning();
      await emitActivity(tx, {
        projectId,
        entityType: "stage",
        entityId: stage.id,
        actorId: actor.id,
        eventType: "stage.created",
        payload: { stageId: stage.id, stageName: stage.name },
      });
      return stage;
    });
    }

    export async function updateStage(
    actor: User,
    stageId: string,
    input: UpdateStageInput
    ): Promise<ProjectStage | null> {
    const data = updateStageSchema.parse(input);

    const [existing] = await db.select().from(projectStagesTable).where(eq(projectStagesTable.id, stageId)).limit(1);
    if (!existing) return null;
    await requireProjectAccess(actor, "project:update", existing.projectId);

    const [updated] = await db
      .update(projectStagesTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projectStagesTable.id, stageId))
      .returning();

    return updated ?? null;
    }

    export async function deleteStage(
    actor: User,
    stageId: string
    ): Promise<void> {
    const [existing] = await db.select().from(projectStagesTable).where(eq(projectStagesTable.id, stageId)).limit(1);
    if (!existing) return;
    await requireProjectAccess(actor, "project:update", existing.projectId);
    await db.delete(projectStagesTable).where(eq(projectStagesTable.id, stageId));
    }

    export async function completeStage(
    actor: User,
    stageId: string
    ): Promise<ProjectStage | null> {
    const [existing] = await db
      .select()
      .from(projectStagesTable)
      .where(eq(projectStagesTable.id, stageId))
      .limit(1);

    if (!existing) return null;
    await requireProjectAccess(actor, "project:update", existing.projectId);

    const isCompleting = !existing.completedAt;
    return db.transaction(async (tx) => {
      const [updated] = await tx
        .update(projectStagesTable)
        .set({
          completedAt: isCompleting ? new Date() : null,
          completedById: isCompleting ? actor.id : null,
          updatedAt: new Date(),
        })
        .where(eq(projectStagesTable.id, stageId))
        .returning();
      await emitActivity(tx, {
        projectId: existing.projectId,
        entityType: "stage",
        entityId: stageId,
        actorId: actor.id,
        eventType: isCompleting ? "stage.completed" : "stage.reopened",
        payload: { stageId },
      });
      return updated;
    });
    }

    export async function reorderStages(
    actor: User,
    projectId: string,
    orderedIds: string[]
    ): Promise<ProjectStage[]> {
    await requireProjectAccess(actor, "project:update", projectId);

    await db.transaction(async (tx) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await tx
          .update(projectStagesTable)
          .set({ position: i, updatedAt: new Date() })
          .where(
            eq(projectStagesTable.id, orderedIds[i])
          );
      }
    });

    return listStages(actor, projectId);
    }
