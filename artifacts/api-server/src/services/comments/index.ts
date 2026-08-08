import {
  db,
  commentsTable,
  usersTable,
  tasksTable,
  kbArticlesTable,
} from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import type { User, Comment } from "@workspace/db";

export type CommentWithAuthor = Comment & { authorDisplayName: string | null; bodyHtml: string };
import { ForbiddenError } from "../access";
import { requireProjectAccess } from "../access/projectAccess";
import { z } from "zod";
import { createNotificationsForMentions } from "../notifications";
import { renderMarkdown } from "../../lib/markdown";
import { emitActivity } from "../activity";
import { NotFoundError } from "../errors";

/** Resolve the project a comment target belongs to. Null for unknown types. */
async function resolveProjectId(
  entityType: string,
  entityId: string
): Promise<string | null> {
  if (entityType === "project") return entityId;
  if (entityType === "task") {
    const [task] = await db
      .select({ projectId: tasksTable.projectId })
      .from(tasksTable)
      .where(eq(tasksTable.id, entityId))
      .limit(1);
    return task?.projectId ?? null;
  }
  if (entityType === "kb_article") {
    const [article] = await db.select({ projectId: kbArticlesTable.projectId }).from(kbArticlesTable).where(eq(kbArticlesTable.id, entityId)).limit(1);
    return article?.projectId ?? null;
  }
  return null;
}

/**
 * Guests are external participants scoped to the projects they were added to.
 * Without this check a guest could read the external comments of *any* project
 * just by knowing a task id — the same membership gate `listFiles` already
 * applies. Members and above keep the flat org-wide read model.
 */
async function assertProjectAccess(
  actor: User,
  action: "comment:create" | "comment:read",
  entityType: string,
  entityId: string,
  visibility?: "internal" | "external",
): Promise<string> {
  const projectId = await resolveProjectId(entityType, entityId);
  if (!projectId) throw new NotFoundError("Comment target not found");
  await requireProjectAccess(actor, action, projectId, visibility ? { visibility } : {});
  return projectId;
}

export { type Comment };

export const addCommentSchema = z.object({
  entityType: z.enum(["project", "task", "kb_article"]),
  entityId: z.string().uuid(),
  bodyMd: z.string().min(1).max(10000),
  visibility: z.enum(["internal", "external"]).default("internal"),
});

export const editCommentSchema = z.object({
  bodyMd: z.string().min(1).max(10000),
});

export type AddCommentInput = z.infer<typeof addCommentSchema>;
export type EditCommentInput = z.infer<typeof editCommentSchema>;

export async function listComments(
  actor: User,
  entityType: string,
  entityId: string
): Promise<CommentWithAuthor[]> {
  // Guests may read external comments only; all other roles go through normal auth
  await assertProjectAccess(actor, "comment:read", entityType, entityId, actor.role === "guest" ? "external" : undefined);

  const conditions = [
    eq(commentsTable.entityType, entityType),
    eq(commentsTable.entityId, entityId),
    isNull(commentsTable.deletedAt),
  ];

  // Guests only see external comments
  if (actor.role === "guest") {
    conditions.push(eq(commentsTable.visibility, "external"));
  }

  const rows = await db
    .select({
      id: commentsTable.id,
      entityType: commentsTable.entityType,
      entityId: commentsTable.entityId,
      authorId: commentsTable.authorId,
      authorDisplayName: usersTable.displayName,
      bodyMd: commentsTable.bodyMd,
      visibility: commentsTable.visibility,
      editedAt: commentsTable.editedAt,
      deletedAt: commentsTable.deletedAt,
      createdAt: commentsTable.createdAt,
      updatedAt: commentsTable.updatedAt,
    })
    .from(commentsTable)
    .leftJoin(usersTable, eq(commentsTable.authorId, usersTable.id))
    .where(and(...conditions))
    .orderBy(commentsTable.createdAt);

  return rows.map((row) => ({ ...row, bodyHtml: renderMarkdown(row.bodyMd) })) as CommentWithAuthor[];
}

export async function addComment(
  actor: User,
  input: AddCommentInput
): Promise<Comment> {
  const data = addCommentSchema.parse(input);
  const projectId = await assertProjectAccess(actor, "comment:create", data.entityType, data.entityId, data.visibility);

  const comment = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(commentsTable)
      .values({
        entityType: data.entityType,
        entityId: data.entityId,
        authorId: actor.id,
        bodyMd: data.bodyMd,
        visibility: data.visibility,
      })
      .returning();
    await emitActivity(tx, {
      projectId,
      entityType: "comment",
      entityId: created.id,
      actorId: actor.id,
      eventType: "comment.added",
      payload: { commentId: created.id, entityType: data.entityType, entityId: data.entityId },
    });
    return created;
  });

  // Create mention notifications
  await createNotificationsForMentions(actor, comment.bodyMd, {
    entityType: data.entityType,
    entityId: data.entityId,
  });

  return comment;
}

export async function editComment(
  actor: User,
  commentId: string,
  input: EditCommentInput
): Promise<Comment | null> {
  const data = editCommentSchema.parse(input);

  const [existing] = await db
    .select()
    .from(commentsTable)
    .where(eq(commentsTable.id, commentId))
    .limit(1);

  if (!existing || existing.deletedAt) return null;
  await assertProjectAccess(actor, "comment:create", existing.entityType, existing.entityId, existing.visibility as "internal" | "external");
  if (existing.authorId !== actor.id && actor.role !== "admin" && actor.role !== "manager") {
    throw new ForbiddenError("Cannot edit another user's comment");
  }

  const projectId = await resolveProjectId(existing.entityType, existing.entityId);
  if (!projectId) throw new NotFoundError("Comment target not found");
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(commentsTable)
      .set({ bodyMd: data.bodyMd, editedAt: new Date(), updatedAt: new Date() })
      .where(eq(commentsTable.id, commentId))
      .returning();
    await emitActivity(tx, {
      projectId,
      entityType: "comment",
      entityId: updated.id,
      actorId: actor.id,
      eventType: "comment.edited",
      payload: { commentId: updated.id, entityType: updated.entityType, entityId: updated.entityId },
    });
    return updated;
  });
}

export async function deleteComment(
  actor: User,
  commentId: string
): Promise<void> {
  const [existing] = await db
    .select()
    .from(commentsTable)
    .where(eq(commentsTable.id, commentId))
    .limit(1);

  if (!existing || existing.deletedAt) return;
  await assertProjectAccess(actor, "comment:create", existing.entityType, existing.entityId, existing.visibility as "internal" | "external");
  if (existing.authorId !== actor.id && actor.role !== "admin" && actor.role !== "manager") {
    throw new ForbiddenError("Cannot delete another user's comment");
  }

  const projectId = await resolveProjectId(existing.entityType, existing.entityId);
  if (!projectId) throw new NotFoundError("Comment target not found");
  await db.transaction(async (tx) => {
    await tx
      .update(commentsTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(commentsTable.id, commentId));
    await emitActivity(tx, {
      projectId,
      entityType: "comment",
      entityId: existing.id,
      actorId: actor.id,
      eventType: "comment.deleted",
      payload: { commentId: existing.id, entityType: existing.entityType, entityId: existing.entityId },
    });
  });
}
