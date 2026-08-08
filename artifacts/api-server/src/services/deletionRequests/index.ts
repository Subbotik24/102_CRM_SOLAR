/**
 * Deletion-request workflow.
 *
 * Admins delete tasks/files immediately. Everyone else (member/manager) who
 * is otherwise allowed to touch the entity instead raises a request here,
 * which notifies every admin; an admin then approves (performs the actual
 * delete) or rejects it.
 */
import { db, deletionRequestsTable, type User } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { authorize } from "../access";
import { ForbiddenError, NotFoundError } from "../errors";
import { notifyAdmins } from "../notifications";
import { deleteTask } from "../tasks";
import { deleteFile } from "../files";
import { requireProjectAccess } from "../access/projectAccess";

export type DeletionEntityType = "task" | "file";

/**
 * Create a deletion request, unless one is already pending for this entity —
 * otherwise a double-click or a stale tab could raise duplicate requests and
 * duplicate admin notifications for the same task/file.
 */
export async function createDeletionRequest(
  actor: User,
  entityType: DeletionEntityType,
  entityId: string,
  entityLabel: string,
  projectId: string
): Promise<void> {
  await requireProjectAccess(actor, "task:update", projectId);
  const [existing] = await db
    .select({ id: deletionRequestsTable.id })
    .from(deletionRequestsTable)
    .where(
      and(
        eq(deletionRequestsTable.entityType, entityType),
        eq(deletionRequestsTable.entityId, entityId),
        eq(deletionRequestsTable.status, "pending")
      )
    )
    .limit(1);
  if (existing) return;

  await db.insert(deletionRequestsTable).values({
    entityType,
    entityId,
    entityLabel,
    projectId,
    requestedById: actor.id,
    status: "pending",
  });

  await notifyAdmins(
    actor,
    "deletion_requested",
    { entityType: "project", entityId: projectId },
    { entityType, entityLabel }
  );
}

async function getRequestOrThrow(requestId: string) {
  const [request] = await db
    .select()
    .from(deletionRequestsTable)
    .where(eq(deletionRequestsTable.id, requestId))
    .limit(1);
  if (!request) throw new NotFoundError("Deletion request not found");
  if (request.status !== "pending") throw new ForbiddenError("Deletion request already resolved");
  return request;
}

export async function approveDeletionRequest(actor: User, requestId: string): Promise<void> {
  authorize(actor, "deletion:resolve");
  const request = await getRequestOrThrow(requestId);

  if (request.entityType === "task") {
    await deleteTask(actor, request.entityId);
  } else if (request.entityType === "file") {
    await deleteFile(request.entityId);
  }

  await db
    .update(deletionRequestsTable)
    .set({ status: "approved", resolvedById: actor.id, resolvedAt: new Date() })
    .where(eq(deletionRequestsTable.id, requestId));
}

export async function rejectDeletionRequest(actor: User, requestId: string): Promise<void> {
  authorize(actor, "deletion:resolve");
  await getRequestOrThrow(requestId);

  await db
    .update(deletionRequestsTable)
    .set({ status: "rejected", resolvedById: actor.id, resolvedAt: new Date() })
    .where(eq(deletionRequestsTable.id, requestId));
}
