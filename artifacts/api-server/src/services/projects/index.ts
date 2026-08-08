import { db, projectsTable, activityEventsTable, projectMembersTable, usersTable, clientsTable, tasksTable } from "@workspace/db";
    import { eq, like, sql, and, ne } from "drizzle-orm";
    import type { User, Project, ProjectMember } from "@workspace/db";
    import { authorize } from "../access";
    import { hasOrganizationProjectAccess, requireProjectAccess } from "../access/projectAccess";
    import { emitActivity } from "../activity";
    import { z } from "zod";
    import { NotFoundError, ValidationError } from "../errors";

    export { type Project };

    export const createProjectSchema = z.object({
    name: z.string().min(1).max(200),
    icon: z.string().max(10).optional(),
    code: z.string().min(1).max(20).optional(),
    summary: z.string().max(500).optional(),
    descriptionMd: z.string().optional(),
    kind: z.enum(["client", "internal", "rd"]).optional(),
    startsOn: z.string().optional(),
    dueOn: z.string().optional(),
    totalHours: z.number().int().positive().optional(),
    clientName: z.string().max(200).optional(),
    clientId: z.string().uuid().optional(),
    parentId: z.string().uuid().optional(),
    });

    export const updateProjectSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    icon: z.string().max(10).optional(),
    summary: z.string().max(500).optional().nullable(),
    descriptionMd: z.string().optional().nullable(),
    kind: z.enum(["client", "internal", "rd"]).optional().nullable(),
    startsOn: z.string().optional().nullable(),
    dueOn: z.string().optional().nullable(),
    totalHours: z.number().int().positive().optional().nullable(),
    clientName: z.string().max(200).optional().nullable(),
    clientId: z.string().uuid().optional().nullable(),
    status: z.enum(["planned", "active", "on_hold", "done", "archived"]).optional(),
    });

    export const moveProjectSchema = z.object({
    newParentId: z.string().uuid().nullable(),
    });

    export type CreateProjectInput = z.infer<typeof createProjectSchema>;
    export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
    export type MoveProjectInput = z.infer<typeof moveProjectSchema>;

    async function generateProjectCode(): Promise<string> {
    // Use MAX of existing numeric suffixes so gaps from deleted projects
    // don't cause collisions (COUNT-based approach would re-hit existing codes).
    const [row] = await db
      .select({
        next: sql<number>`COALESCE(MAX(CAST(SUBSTRING(code FROM 3) AS int)), 0) + 1`,
      })
      .from(projectsTable)
      .where(sql`code ~ '^P-[0-9]+$'`);
    const num = row?.next ?? 1;
    return `P-${String(num).padStart(3, "0")}`;
    }

    export async function createProject(
    actor: User,
    input: CreateProjectInput
    ): Promise<Project> {
    authorize(actor, "project:create");

    const data = createProjectSchema.parse(input);
    const code = data.code ?? (await generateProjectCode());

    let path = code;
    let depth = 0;

    if (data.parentId) {
      const parent = await getProjectById(data.parentId);
      if (!parent) throw new NotFoundError("Parent project not found");
      if (parent.depth >= 4) throw new ValidationError("Maximum nesting depth (4) exceeded");
      path = `${parent.path}.${code}`;
      depth = parent.depth + 1;
    }

    // If clientId provided, resolve clientName from it
    let resolvedClientName = data.clientName ?? null;
    const resolvedClientId = data.clientId ?? null;
    if (data.clientId) {
      const [client] = await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, data.clientId)).limit(1);
      if (client) resolvedClientName = client.name;
    }

    return db.transaction(async (tx) => {
      const [project] = await tx
        .insert(projectsTable)
        .values({
          code,
          name: data.name,
          icon: data.icon ?? "📁",
          path,
          depth,
          ownerId: actor.id,
          status: "planned",
          kind: data.kind,
          startsOn: data.startsOn ?? null,
          dueOn: data.dueOn ?? null,
          descriptionMd: data.descriptionMd ?? null,
          summary: data.summary ?? null,
          totalHours: data.totalHours ?? null,
          clientName: resolvedClientName,
          clientId: resolvedClientId,
          parentId: data.parentId ?? null,
        })
        .returning();

      await tx.insert(activityEventsTable).values({
        projectId: project.id,
        entityType: "project",
        entityId: project.id,
        actorId: actor.id,
        eventType: "project.created",
        payload: {
          projectId: project.id,
          projectCode: project.code,
          projectName: project.name,
        },
      });

      return project;
    });
    }

    export async function getProjectById(id: string): Promise<Project | null> {
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, id))
      .limit(1);
    return project ?? null;
    }

    /**
     * Read a project without exposing whether an unassigned project exists.
     * Route handlers must use this instead of the raw lookup for user-facing
     * project IDs; internal domain code can keep using getProjectById.
     */
    export async function getProjectForActor(actor: User, id: string): Promise<Project | null> {
    const project = await getProjectById(id);
    if (!project) return null;
    try {
      await requireProjectAccess(actor, "project:read", project.id);
      return project;
    } catch {
      return null;
    }
    }

    export async function listProjects(
    actor: User,
    opts?: { archived?: boolean }
    ): Promise<Project[]> {
    authorize(actor, "project:read");
    const membership = sql`EXISTS (SELECT 1 FROM ${projectMembersTable} pm WHERE pm.project_id = ${projectsTable.id} AND pm.user_id = ${actor.id})`;
    return db
      .select()
      .from(projectsTable)
      .where(and(
        opts?.archived ? eq(projectsTable.status, "archived") : ne(projectsTable.status, "archived"),
        hasOrganizationProjectAccess(actor) ? undefined : membership,
      ))
      .orderBy(projectsTable.path);
    }

    /** Returns all descendants of a project (direct and indirect children). */
    export async function listProjectSubtree(
    actor: User,
    projectId: string
    ): Promise<Project[]> {
    await requireProjectAccess(actor, "project:read", projectId);
    const project = await getProjectById(projectId);
    if (!project) return [];
    return db
      .select()
      .from(projectsTable)
      .where(like(projectsTable.path, `${project.path}.%`))
      .orderBy(projectsTable.path);
    }

    export async function updateProject(
    actor: User,
    id: string,
    input: UpdateProjectInput
    ): Promise<Project | null> {
    await requireProjectAccess(actor, "project:update", id);
    const data = updateProjectSchema.parse(input);

    // If clientId provided, resolve clientName from it
    if (data.clientId) {
      const [client] = await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, data.clientId)).limit(1);
      if (client) data.clientName = client.name;
    } else if (data.clientId === null) {
      data.clientName = null;
    }

    return db.transaction(async (tx) => {
      const [updated] = await tx
        .update(projectsTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(projectsTable.id, id))
        .returning();

      if (!updated) return null;

      await tx.insert(activityEventsTable).values({
        projectId: updated.id,
        entityType: "project",
        entityId: updated.id,
        actorId: actor.id,
        eventType: "project.updated",
        payload: { projectId: updated.id, changes: data },
      });
      return updated;
    });
    }

    export async function deleteProject(
    actor: User,
    id: string
    ): Promise<void> {
    await requireProjectAccess(actor, "project:archive", id);
    await db.delete(projectsTable).where(eq(projectsTable.id, id));
    }

    export async function archiveProject(
    actor: User,
    id: string
    ): Promise<Project | null> {
    await requireProjectAccess(actor, "project:archive", id);

    const project = await getProjectById(id);
    if (!project) return null;

    const updated = await db.transaction(async (tx) => {
      // Archiving closes the project's open work: every unfinished task is
      // marked done so it stops counting toward active stats/boards.
      await tx
        .update(tasksTable)
        .set({ status: "done", completedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(tasksTable.projectId, id), ne(tasksTable.status, "done")));

      const [row] = await tx
        .update(projectsTable)
        .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(projectsTable.id, id))
        .returning();

      await tx.insert(activityEventsTable).values({
        projectId: id,
        entityType: "project",
        entityId: id,
        actorId: actor.id,
        eventType: "project.archived",
        payload: { projectId: id },
      });

      return row;
    });

    return updated;
    }

    export async function restoreProject(
    actor: User,
    id: string
    ): Promise<Project | null> {
    await requireProjectAccess(actor, "project:archive", id);

    const project = await getProjectById(id);
    if (!project || project.status !== "archived") return null;

    return db.transaction(async (tx) => {
      const [updated] = await tx
        .update(projectsTable)
        .set({ status: "active", archivedAt: null, updatedAt: new Date() })
        .where(eq(projectsTable.id, id))
        .returning();
      if (!updated) return null;
      await tx.insert(activityEventsTable).values({
        projectId: id,
        entityType: "project",
        entityId: id,
        actorId: actor.id,
        eventType: "project.restored",
        payload: { projectId: id },
      });
      return updated;
    });
    }

    /**
    * Move a project to a new parent (or to root if newParentId is null).
    * Rejects moves that would create a cycle (moving a project under one of its own descendants).
    * Rejects moves that would exceed max depth.
    * Rewrites paths for the moved project and all of its descendants.
    */
    export async function moveProject(
    actor: User,
    id: string,
    input: MoveProjectInput
    ): Promise<Project> {
    await requireProjectAccess(actor, "project:update", id);
    const data = moveProjectSchema.parse(input);

    const project = await getProjectById(id);
    if (!project) throw new NotFoundError("Project not found");

    let newDepth = 0;
    let newParentPath: string | null = null;

    if (data.newParentId) {
      if (data.newParentId === id) {
        throw new ValidationError("A project cannot be its own parent");
      }

      const newParent = await getProjectById(data.newParentId);
      if (!newParent) throw new NotFoundError("New parent project not found");

      // Cycle check: newParent cannot be a descendant of the project being moved
      if (
        newParent.path === project.path ||
        newParent.path.startsWith(project.path + ".")
      ) {
        throw new ValidationError(
          "Cannot move a project under one of its own descendants (cycle detected)"
        );
      }

      // Depth check: the moved project subtree must fit within depth 4
      const subtreeMaxRelativeDepth = await getSubtreeMaxDepth(id);
      if (newParent.depth + 1 + subtreeMaxRelativeDepth > 4) {
        throw new ValidationError(
          "Move would exceed maximum nesting depth of 4"
        );
      }

      newDepth = newParent.depth + 1;
      newParentPath = newParent.path;
    }

    const oldPath = project.path;
    const newPath = newParentPath ? `${newParentPath}.${project.code}` : project.code;
    const depthDelta = newDepth - project.depth;

    return db.transaction(async (tx) => {
      // Rewrite all descendants' paths (must happen before updating the project itself
      // to avoid matching the updated project's new path prematurely)
      if (oldPath !== newPath) {
        // All strict descendants: path LIKE 'oldPath.%'
        const descendants = await tx
          .select({ id: projectsTable.id, path: projectsTable.path, depth: projectsTable.depth })
          .from(projectsTable)
          .where(like(projectsTable.path, `${oldPath}.%`));

        for (const desc of descendants) {
          const updatedPath = newPath + desc.path.slice(oldPath.length);
          await tx
            .update(projectsTable)
            .set({
              path: updatedPath,
              depth: desc.depth + depthDelta,
              updatedAt: new Date(),
            })
            .where(eq(projectsTable.id, desc.id));
        }
      }

      // Update the project itself
      const [updated] = await tx
        .update(projectsTable)
        .set({
          parentId: data.newParentId,
          path: newPath,
          depth: newDepth,
          updatedAt: new Date(),
        })
        .where(eq(projectsTable.id, id))
        .returning();

      await tx.insert(activityEventsTable).values({
        projectId: id,
        entityType: "project",
        entityId: id,
        actorId: actor.id,
        eventType: "project.moved",
        payload: {
          projectId: id,
          oldPath,
          newPath,
          newParentId: data.newParentId,
        },
      });

      return updated;
    });
    }

    /** Returns the maximum depth of a project's subtree relative to the project's own depth. */
    async function getSubtreeMaxDepth(projectId: string): Promise<number> {
    const project = await getProjectById(projectId);
    if (!project) return 0;
    const descendants = await db
      .select({ depth: projectsTable.depth })
      .from(projectsTable)
      .where(like(projectsTable.path, `${project.path}.%`));
    if (descendants.length === 0) return 0;
    const maxDescDepth = Math.max(...descendants.map((d) => d.depth));
    return maxDescDepth - project.depth;
    }

    // ── Members ──────────────────────────────────────────────────────────────

    export type ProjectMemberWithUser = ProjectMember & {
    userDisplayName: string;
    userEmail: string;
    userAvatarKey: string | null;
    };

    export async function listProjectMembers(
    actor: User,
    projectId: string
    ): Promise<ProjectMemberWithUser[]> {
    await requireProjectAccess(actor, "project:read", projectId);
    const rows = await db
      .select({
        id: projectMembersTable.id,
        projectId: projectMembersTable.projectId,
        userId: projectMembersTable.userId,
        role: projectMembersTable.role,
        addedById: projectMembersTable.addedById,
        joinedAt: projectMembersTable.joinedAt,
        userDisplayName: usersTable.displayName,
        userEmail: usersTable.email,
        userAvatarKey: usersTable.avatarKey,
      })
      .from(projectMembersTable)
      .innerJoin(usersTable, eq(projectMembersTable.userId, usersTable.id))
      .where(eq(projectMembersTable.projectId, projectId));
    return rows;
    }

    export const addMemberSchema = z.object({
    userId: z.string().uuid(),
    role: z.enum(["owner", "manager", "member", "viewer"]).default("member"),
    });

    export async function addProjectMember(
    actor: User,
    projectId: string,
    input: z.infer<typeof addMemberSchema>
    ): Promise<ProjectMember> {
    await requireProjectAccess(actor, "project:update", projectId);
    const data = addMemberSchema.parse(input);
    const [target] = await db
      .select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, data.userId))
      .limit(1);
    if (!target) throw new NotFoundError("User not found");
    if (target.role === "guest" && data.role !== "viewer") {
      throw new ValidationError("Guests can only be assigned the viewer project role");
    }

    return db.transaction(async (tx) => {
      const [member] = await tx
        .insert(projectMembersTable)
        .values({ projectId, userId: data.userId, role: data.role, addedById: actor.id })
        .onConflictDoUpdate({
          target: [projectMembersTable.projectId, projectMembersTable.userId],
          set: { role: data.role },
        })
        .returning();
      await emitActivity(tx, {
        projectId,
        entityType: "project_member",
        entityId: member.id,
        actorId: actor.id,
        eventType: "project.member_changed",
        payload: { userId: data.userId, role: data.role },
      });
      return member;
    });
    }

    export async function removeProjectMember(
    actor: User,
    projectId: string,
    userId: string
    ): Promise<void> {
    await requireProjectAccess(actor, "project:update", projectId);
    await db.transaction(async (tx) => {
      const [removed] = await tx
        .delete(projectMembersTable)
        .where(
          and(
            eq(projectMembersTable.projectId, projectId),
            eq(projectMembersTable.userId, userId)
          )
        )
        .returning({ id: projectMembersTable.id });
      if (!removed) throw new NotFoundError("Project member not found");
      await emitActivity(tx, {
        projectId,
        entityType: "project_member",
        entityId: removed.id,
        actorId: actor.id,
        eventType: "project.member_removed",
        payload: { userId },
      });
    });
    }
