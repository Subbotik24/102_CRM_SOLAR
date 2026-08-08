import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { projectsTable } from "./projects";

/**
 * Free-form informational blocks a user attaches to a project (address,
 * connection details, contacts, etc). Purely descriptive notes — never
 * read by tasks, members, statuses, or statistics.
 */
export const projectInfoBlocksTable = pgTable(
  "project_info_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("project_info_blocks_project_idx").on(t.projectId, t.position)]
);

export type ProjectInfoBlock = typeof projectInfoBlocksTable.$inferSelect;
export type InsertProjectInfoBlock = typeof projectInfoBlocksTable.$inferInsert;
