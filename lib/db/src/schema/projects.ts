import {
  pgTable,
  text,
  uuid,
  timestamp,
  pgEnum,
  integer,
  index,
  check,
  date,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { clientsTable } from "./clients";

export const projectStatusEnum = pgEnum("project_status", [
  "planned",
  "active",
  "on_hold",
  "done",
  "archived",
]);

export const projectKindEnum = pgEnum("project_kind", [
  "client",
  "internal",
  "rd",
]);

export const projectsTable = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id").references(
      (): AnyPgColumn => projectsTable.id,
      { onDelete: "cascade" }
    ),
    path: text("path").notNull(),
    depth: integer("depth").notNull().default(0),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    clientName: text("client_name"),
    clientId: uuid("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    status: projectStatusEnum("status").notNull().default("planned"),
    kind: projectKindEnum("kind"),
    startsOn: date("starts_on"),
    dueOn: date("due_on"),
    descriptionMd: text("description_md"),
    icon: text("icon").notNull().default("📁"),
    summary: text("summary"),
    totalHours: integer("total_hours"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("projects_depth_check", sql`${t.depth} >= 0 AND ${t.depth} <= 4`),
    index("projects_path_idx").on(t.path),
  ]
);

export type Project = typeof projectsTable.$inferSelect;
export type InsertProject = typeof projectsTable.$inferInsert;
