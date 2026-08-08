import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { projectsTable } from "./projects";

export const logEntryTypeEnum = pgEnum("log_entry_type", [
  "decision",
  "milestone",
  "risk",
  "note",
]);

export const projectLogEntriesTable = pgTable(
  "project_log_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    entryType: logEntryTypeEnum("entry_type").notNull().default("note"),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull().default(""),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("project_log_entries_project_idx").on(t.projectId, t.occurredAt),
  ]
);

export type ProjectLogEntry = typeof projectLogEntriesTable.$inferSelect;
export type InsertProjectLogEntry = typeof projectLogEntriesTable.$inferInsert;
