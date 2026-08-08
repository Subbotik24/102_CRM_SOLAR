import {
    pgTable,
    uuid,
    text,
    timestamp,
    integer,
    index,
    } from "drizzle-orm/pg-core";
    import { projectsTable } from "./projects";
    import { usersTable } from "./users";

    export const projectStagesTable = pgTable(
    "project_stages",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      projectId: uuid("project_id")
        .notNull()
        .references(() => projectsTable.id, { onDelete: "cascade" }),
      name: text("name").notNull(),
      color: text("color"),
      position: integer("position").notNull().default(0),
      completedAt: timestamp("completed_at", { withTimezone: true }),
      completedById: uuid("completed_by_id").references(() => usersTable.id, {
        onDelete: "set null",
      }),
      createdAt: timestamp("created_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
    },
    (t) => [index("project_stages_project_idx").on(t.projectId)]
    );

    export type ProjectStage = typeof projectStagesTable.$inferSelect;
    export type InsertProjectStage = typeof projectStagesTable.$inferInsert;
    