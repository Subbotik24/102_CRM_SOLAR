import { db, libraryItemsTable } from "@workspace/db";
import { eq, isNull, and } from "drizzle-orm";
import type { User, LibraryItem } from "@workspace/db";
import { authorize } from "../access";
import { z } from "zod";

export { type LibraryItem };

export const LIBRARY_CATEGORIES = [
  "template",
  "standard",
  "instruction",
  "material",
  "report",
  "other",
] as const;
export type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number];

export const createLibraryItemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  category: z.enum(LIBRARY_CATEGORIES).default("other"),
  url: z.string().max(2000).optional().nullable(),
});

export const updateLibraryItemSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  category: z.enum(LIBRARY_CATEGORIES).optional(),
  url: z.string().max(2000).optional().nullable(),
});

export async function listLibraryItems(
  actor: User,
  category?: string
): Promise<LibraryItem[]> {
  authorize(actor, "project:read");
  const where = category
    ? and(isNull(libraryItemsTable.archivedAt), eq(libraryItemsTable.category, category))
    : isNull(libraryItemsTable.archivedAt);
  return db
    .select()
    .from(libraryItemsTable)
    .where(where)
    .orderBy(libraryItemsTable.createdAt);
}

export async function createLibraryItem(
  actor: User,
  input: z.infer<typeof createLibraryItemSchema>
): Promise<LibraryItem> {
  authorize(actor, "project:update");
  const data = createLibraryItemSchema.parse(input);
  const [item] = await db
    .insert(libraryItemsTable)
    .values({ ...data, addedById: actor.id })
    .returning();
  return item;
}

export async function updateLibraryItem(
  actor: User,
  id: string,
  input: z.infer<typeof updateLibraryItemSchema>
): Promise<LibraryItem | null> {
  authorize(actor, "project:update");
  const data = updateLibraryItemSchema.parse(input);
  const [item] = await db
    .update(libraryItemsTable)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(libraryItemsTable.id, id))
    .returning();
  return item ?? null;
}

export async function deleteLibraryItem(actor: User, id: string): Promise<void> {
  authorize(actor, "project:archive");
  await db
    .update(libraryItemsTable)
    .set({ archivedAt: new Date() })
    .where(eq(libraryItemsTable.id, id));
}
