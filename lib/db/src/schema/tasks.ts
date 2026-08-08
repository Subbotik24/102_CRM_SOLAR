import {
    pgTable,
    text,
    uuid,
    timestamp,
    pgEnum,
    integer,
    index,
    check,
    } from "drizzle-orm/pg-core";
    import type { AnyPgColumn } from "drizzle-orm/pg-core";
    import { sql } from "drizzle-orm";
    import { usersTable } from "./users";
    import { projectsTable } from "./projects";
    import { projectStagesTable } from "./project_stages";

    export const taskStatusEnum = pgEnum("task_status", [
    "todo",
    "in_progress",
    "blocked",
    "review",
    "done",
    ]);

    export const taskPriorityEnum = pgEnum("task_priority", [
    "low",
    "medium",
    "high",
    "critical",
    ]);

    export const tasksTable = pgTable(
    "tasks",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      projectId: uuid("project_id")
        .notNull()
        .references(() => projectsTable.id, { onDelete: "cascade" }),
      parentTaskId: uuid("parent_task_id").references(
        (): AnyPgColumn => tasksTable.id,
        { onDelete: "set null" }
      ),
      stageId: uuid("stage_id").references(() => projectStagesTable.id, {
        onDelete: "set null",
      }),
      path: text("path").notNull(),
      depth: integer("depth").notNull().default(0),
      code: text("code").notNull().unique(),
      title: text("title").notNull(),
      descriptionMd: text("description_md"),
      status: taskStatusEnum("status").notNull().default("todo"),
      priority: taskPriorityEnum("priority").notNull().default("medium"),
      assigneeId: uuid("assignee_id").references(() => usersTable.id, {
        onDelete: "set null",
      }),
      dueAt: timestamp("due_at", { withTimezone: true }),
      position: integer("position").notNull().default(0),
      completedAt: timestamp("completed_at", { withTimezone: true }),
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
      check("tasks_depth_check", sql`${t.depth} >= 0 AND ${t.depth} <= 2`),
      index("tasks_project_status_idx").on(t.projectId, t.status, t.dueAt),
      index("tasks_assignee_status_idx").on(t.assigneeId, t.status, t.dueAt),
      index("tasks_path_idx").on(t.path),
    ]
    );

    export type Task = typeof tasksTable.$inferSelect;
    export type InsertTask = typeof tasksTable.$inferInsert;
    