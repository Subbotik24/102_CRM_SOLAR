import {
    pgTable,
    uuid,
    text,
    timestamp,
    integer,
    index,
    } from "drizzle-orm/pg-core";
    import { tasksTable } from "./tasks";

    export const checklistItemsTable = pgTable(
    "checklist_items",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      taskId: uuid("task_id")
        .notNull()
        .references(() => tasksTable.id, { onDelete: "cascade" }),
      title: text("title").notNull(),
      position: integer("position").notNull().default(0),
      completedAt: timestamp("completed_at", { withTimezone: true }),
      createdAt: timestamp("created_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
    },
    (t) => [index("checklist_items_task_idx").on(t.taskId)]
    );

    export type ChecklistItem = typeof checklistItemsTable.$inferSelect;
    export type InsertChecklistItem = typeof checklistItemsTable.$inferInsert;
    