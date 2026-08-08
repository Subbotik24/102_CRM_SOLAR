import {
  pgTable,
  text,
  uuid,
  timestamp,
  varchar,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const commentsTable = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    bodyMd: text("body_md").notNull(),
    visibility: varchar("visibility", { length: 20 }).notNull().default("internal"),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_comments_entity").on(t.entityType, t.entityId, t.createdAt)]
);

export type Comment = typeof commentsTable.$inferSelect;
export type NewComment = typeof commentsTable.$inferInsert;
