import { db, projectMembersTable, type User } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { authorize, type Action, type ProjectAccessResource } from "./index";
import { NotFoundError } from "../errors";

/**
 * Resolve direct project membership and apply the single authorization policy.
 * This intentionally does not traverse a project's parent chain: assignments
 * are exact, so adding someone to a parent never exposes its descendants.
 */
export async function requireProjectAccess(
  actor: User,
  action: Action,
  projectId: string,
  options: Omit<ProjectAccessResource, "kind" | "projectId" | "isMember"> = {},
): Promise<void> {
  const isMember = actor.role === "admin" || actor.role === "manager"
    ? true
    : Boolean((await db
      .select({ id: projectMembersTable.id })
      .from(projectMembersTable)
      .where(and(eq(projectMembersTable.projectId, projectId), eq(projectMembersTable.userId, actor.id)))
      .limit(1))[0]);

  // Do not disclose a project's existence to accounts without an explicit
  // assignment. Admins and managers are organization-wide by policy; everyone
  // else needs a direct row in project_members (parents never imply children).
  if (!isMember) throw new NotFoundError("Project not found");
  authorize(actor, action, { kind: "project", projectId, isMember, ...options });
}

/** SQL predicate data for project-scoped list queries. */
export function hasOrganizationProjectAccess(actor: User): boolean {
  return actor.role === "admin" || actor.role === "manager";
}
