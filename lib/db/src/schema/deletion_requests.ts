import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { projectsTable } from "./projects";
import { usersTable } from "./users";

/**
 * A pending request to delete a task or file, raised by a non-admin actor.
 * Admins delete directly (no row is created); everyone else must wait for
 * an admin to approve or reject the request here.
 */
export const deletionRequestsTable = pgTable(
  "deletion_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(), // 'task' | 'file'
    entityId: uuid("entity_id").notNull(),
    entityLabel: text("entity_label").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    requestedById: uuid("requested_by_id")
      .notNull()
      .references(() => usersTable.id),
    status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'rejected'
    resolvedById: uuid("resolved_by_id").references(() => usersTable.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("deletion_requests_entity_idx").on(t.entityType, t.entityId, t.status),
  ]
);

export type DeletionRequest = typeof deletionRequestsTable.$inferSelect;
export type InsertDeletionRequest = typeof deletionRequestsTable.$inferInsert;
