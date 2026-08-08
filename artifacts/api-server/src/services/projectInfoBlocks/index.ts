/**
 * Project info blocks — free-form title/body notes a user attaches to a
 * project (address, connection details, contacts, hours, ...). Purely
 * descriptive; never read by tasks, members, statuses, or statistics.
 */
import { db, projectInfoBlocksTable } from "@workspace/db";
import { eq, asc, max } from "drizzle-orm";
import type { User, ProjectInfoBlock } from "@workspace/db";
import { requireProjectAccess } from "../access/projectAccess";
import { z } from "zod";

export { type ProjectInfoBlock };

export const createInfoBlockSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(10000).default(""),
});

export const updateInfoBlockSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(10000).optional(),
});

export type CreateInfoBlockInput = z.infer<typeof createInfoBlockSchema>;
export type UpdateInfoBlockInput = z.infer<typeof updateInfoBlockSchema>;

export async function listInfoBlocks(
  actor: User,
  projectId: string
): Promise<ProjectInfoBlock[]> {
  await requireProjectAccess(actor, "project:read", projectId);
  return db
    .select()
    .from(projectInfoBlocksTable)
    .where(eq(projectInfoBlocksTable.projectId, projectId))
    .orderBy(asc(projectInfoBlocksTable.position));
}

export async function createInfoBlock(
  actor: User,
  projectId: string,
  input: CreateInfoBlockInput
): Promise<ProjectInfoBlock> {
  await requireProjectAccess(actor, "project:update", projectId);
  const data = createInfoBlockSchema.parse(input);

  const [{ maxPos }] = await db
    .select({ maxPos: max(projectInfoBlocksTable.position) })
    .from(projectInfoBlocksTable)
    .where(eq(projectInfoBlocksTable.projectId, projectId));

  const [block] = await db
    .insert(projectInfoBlocksTable)
    .values({ projectId, title: data.title, body: data.body, position: (maxPos ?? -1) + 1 })
    .returning();

  return block;
}

export async function updateInfoBlock(
  actor: User,
  blockId: string,
  input: UpdateInfoBlockInput
): Promise<ProjectInfoBlock | null> {
  const data = updateInfoBlockSchema.parse(input);

  const [existing] = await db
    .select({ projectId: projectInfoBlocksTable.projectId })
    .from(projectInfoBlocksTable)
    .where(eq(projectInfoBlocksTable.id, blockId))
    .limit(1);
  if (!existing) return null;
  await requireProjectAccess(actor, "project:update", existing.projectId);

  const [updated] = await db
    .update(projectInfoBlocksTable)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(projectInfoBlocksTable.id, blockId))
    .returning();

  return updated ?? null;
}

export async function deleteInfoBlock(actor: User, blockId: string): Promise<void> {
  const [existing] = await db
    .select({ projectId: projectInfoBlocksTable.projectId })
    .from(projectInfoBlocksTable)
    .where(eq(projectInfoBlocksTable.id, blockId))
    .limit(1);
  if (!existing) return;
  await requireProjectAccess(actor, "project:update", existing.projectId);
  await db.delete(projectInfoBlocksTable).where(eq(projectInfoBlocksTable.id, blockId));
}
