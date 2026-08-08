import {
  pgTable,
  uuid,
  timestamp,
  text,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { projectsTable } from "./projects";

export const activityEventsTable = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projectsTable.id, {
      onDelete: "cascade",
    }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("activity_events_project_created_idx").on(t.projectId, t.createdAt),
    index("activity_events_entity_idx").on(
      t.entityType,
      t.entityId,
      t.createdAt
    ),
  ]
);

export type ActivityEvent = typeof activityEventsTable.$inferSelect;
export type InsertActivityEvent = typeof activityEventsTable.$inferInsert;
