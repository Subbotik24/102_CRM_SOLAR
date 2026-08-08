import {
    pgTable,
    uuid,
    timestamp,
    pgEnum,
    uniqueIndex,
    } from "drizzle-orm/pg-core";
    import { usersTable } from "./users";
    import { projectsTable } from "./projects";

    // Project-membership roles are a distinct vocabulary from account roles
    // (users.role: admin/manager/member/guest — see services/access/index.ts).
    // Membership role controls visibility within one project's members list;
    // account role controls what the user can do platform-wide. To add a
    // guest account to a project, set membership role to "viewer" — there is
    // no "guest" membership role.
    export const projectMemberRoleEnum = pgEnum("project_member_role", [
    "owner",
    "manager",
    "member",
    "viewer",
    ]);

    export const projectMembersTable = pgTable(
    "project_members",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      projectId: uuid("project_id")
        .notNull()
        .references(() => projectsTable.id, { onDelete: "cascade" }),
      userId: uuid("user_id")
        .notNull()
        .references(() => usersTable.id, { onDelete: "cascade" }),
      role: projectMemberRoleEnum("role").notNull().default("member"),
      addedById: uuid("added_by_id").references(() => usersTable.id, {
        onDelete: "set null",
      }),
      joinedAt: timestamp("joined_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (t) => [
      uniqueIndex("project_members_project_user_idx").on(t.projectId, t.userId),
    ]
    );

    export type ProjectMember = typeof projectMembersTable.$inferSelect;
    export type InsertProjectMember = typeof projectMembersTable.$inferInsert;
    