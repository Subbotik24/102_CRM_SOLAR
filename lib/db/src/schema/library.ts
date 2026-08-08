import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const LIBRARY_CATEGORIES = [
  "template",
  "standard",
  "instruction",
  "material",
  "report",
  "other",
] as const;

export type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number];

export const libraryItemsTable = pgTable(
  "library_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category").notNull().default("other"),
    url: text("url"),
    addedById: uuid("added_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("library_items_category_idx").on(t.category)]
);

export type LibraryItem = typeof libraryItemsTable.$inferSelect;
export type InsertLibraryItem = typeof libraryItemsTable.$inferInsert;
