import {
  db,
  conversationsTable,
  conversationMembersTable,
  messagesTable,
  usersTable,
} from "@workspace/db";
import { eq, and, desc, lt, gt, isNull, sql } from "drizzle-orm";
import type { User, Conversation, ConversationMember, Message } from "@workspace/db";
import { authorize } from "../access";
import { requireProjectAccess } from "../access/projectAccess";
import { z } from "zod";
import { createNewMessageNotifications } from "../notifications";
import { NotFoundError } from "../errors";

export { type Conversation, type ConversationMember, type Message };

export type MessageWithAuthor = Message & { authorDisplayName: string | null };

const MESSAGE_COLUMNS = {
  id: messagesTable.id,
  conversationId: messagesTable.conversationId,
  authorId: messagesTable.authorId,
  bodyMd: messagesTable.bodyMd,
  replyToId: messagesTable.replyToId,
  editedAt: messagesTable.editedAt,
  deletedAt: messagesTable.deletedAt,
  createdAt: messagesTable.createdAt,
  updatedAt: messagesTable.updatedAt,
  authorDisplayName: usersTable.displayName,
};

export const createDirectConversationSchema = z.object({
  otherUserId: z.string().uuid(),
});

export const createProjectConversationSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
});

export const sendMessageSchema = z.object({
  bodyMd: z.string().min(1).max(20000),
  replyToId: z.string().uuid().optional(),
});

export const editMessageSchema = z.object({
  bodyMd: z.string().min(1).max(20000),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type EditMessageInput = z.infer<typeof editMessageSchema>;

// ── Conversation access check ──────────────────────────────────────────────

export async function requireConversationMember(
  actor: User,
  conversationId: string
): Promise<ConversationMember> {
  const [member] = await db
    .select()
    .from(conversationMembersTable)
    .where(
      and(
        eq(conversationMembersTable.conversationId, conversationId),
        eq(conversationMembersTable.userId, actor.id)
      )
    )
    .limit(1);

  if (!member) {
    throw new NotFoundError("Conversation not found");
  }
  return member;
}

async function requireConversationAccess(actor: User, action: "chat:read" | "chat:write", conversationId: string): Promise<Conversation | null> {
  const [conversation] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, conversationId)).limit(1);
  if (!conversation) return null;
  if (conversation.kind === "project" && conversation.projectId) {
    await requireProjectAccess(actor, action, conversation.projectId, { conversation: "project" });
  } else {
    authorize(actor, action);
  }
  await requireConversationMember(actor, conversationId);
  return conversation;
}

// ── Create conversations ───────────────────────────────────────────────────

export async function createDirectConversation(
  actor: User,
  otherUserId: string
): Promise<Conversation> {
  authorize(actor, "chat:write");

  // Check if a direct conversation already exists between the two users
  const existing = await db.execute(sql`
    SELECT c.id FROM conversations c
    JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = ${actor.id}
    JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = ${otherUserId}
    WHERE c.kind = 'direct'
    LIMIT 1
  `);

  if (existing.rows.length > 0) {
    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, existing.rows[0].id as string))
      .limit(1);
    return conv;
  }

  return db.transaction(async (tx) => {
    const [conv] = await tx
      .insert(conversationsTable)
      .values({ kind: "direct", createdById: actor.id })
      .returning();

    // Deduplicate in case actor creates a conversation with themselves
    const memberIds = [...new Set([actor.id, otherUserId])];
    await tx.insert(conversationMembersTable).values(
      memberIds.map((userId) => ({ conversationId: conv.id, userId }))
    );

    return conv;
  });
}

export async function createProjectConversation(
  actor: User,
  projectId: string,
  title: string
): Promise<Conversation> {
  await requireProjectAccess(actor, "chat:write", projectId, { conversation: "project" });

  return db.transaction(async (tx) => {
    const [conv] = await tx
      .insert(conversationsTable)
      .values({ kind: "project", projectId, title, createdById: actor.id })
      .returning();

    await tx
      .insert(conversationMembersTable)
      .values({ conversationId: conv.id, userId: actor.id });

    return conv;
  });
}

// ── List conversations ─────────────────────────────────────────────────────

export async function listConversations(actor: User): Promise<Conversation[]> {
  if (actor.role !== "guest") authorize(actor, "chat:read");

  const memberRows = await db
    .select({ conversationId: conversationMembersTable.conversationId })
    .from(conversationMembersTable)
    .where(eq(conversationMembersTable.userId, actor.id));

  if (memberRows.length === 0) return [];

  const convIds = memberRows.map((r) => r.conversationId);

  const rows = await db
    .select()
    .from(conversationsTable)
    .orderBy(desc(conversationsTable.updatedAt));

  const memberConversations = rows.filter((c) => convIds.includes(c.id));
  if (actor.role !== "guest") return memberConversations;
  const accessible: Conversation[] = [];
  for (const conversation of memberConversations) {
    if (conversation.kind !== "project" || !conversation.projectId) continue;
    try {
      await requireProjectAccess(actor, "chat:read", conversation.projectId, { conversation: "project" });
      accessible.push(conversation);
    } catch {
      // Do not expose inaccessible project conversations in a list.
    }
  }
  return accessible;
}

export async function getConversation(
  actor: User,
  conversationId: string
): Promise<Conversation | null> {
  return requireConversationAccess(actor, "chat:read", conversationId);
}

// ── Add/remove conversation members ───────────────────────────────────────

export async function addConversationMember(
  actor: User,
  conversationId: string,
  userId: string
): Promise<void> {
  if (!await requireConversationAccess(actor, "chat:write", conversationId)) {
    throw new NotFoundError("Conversation not found");
  }

  await db
    .insert(conversationMembersTable)
    .values({ conversationId, userId })
    .onConflictDoNothing();
}

export async function listConversationMembers(
  actor: User,
  conversationId: string
): Promise<ConversationMember[]> {
  if (!await requireConversationAccess(actor, "chat:read", conversationId)) {
    throw new NotFoundError("Conversation not found");
  }

  return db
    .select()
    .from(conversationMembersTable)
    .where(eq(conversationMembersTable.conversationId, conversationId));
}

// ── Messages ──────────────────────────────────────────────────────────────

/** List messages cursor-paginated, newest-first. cursor = message id */
export async function listMessages(
  actor: User,
  conversationId: string,
  opts: { cursor?: string; limit?: number; after?: string } = {}
): Promise<MessageWithAuthor[]> {
  if (!await requireConversationAccess(actor, "chat:read", conversationId)) {
    throw new NotFoundError("Conversation not found");
  }

  const limit = Math.min(opts.limit ?? 50, 100);

  let rows: MessageWithAuthor[];

  if (opts.after) {
    // Poll mode: messages newer than this id
    const [ref] = await db
      .select({ createdAt: messagesTable.createdAt })
      .from(messagesTable)
      .where(eq(messagesTable.id, opts.after))
      .limit(1);

    if (!ref) {
      rows = [];
    } else {
      rows = await db
        .select(MESSAGE_COLUMNS)
        .from(messagesTable)
        .innerJoin(usersTable, eq(messagesTable.authorId, usersTable.id))
        .where(
          and(
            eq(messagesTable.conversationId, conversationId),
            isNull(messagesTable.deletedAt),
            gt(messagesTable.createdAt, ref.createdAt)
          )
        )
        .orderBy(messagesTable.createdAt);
    }
  } else if (opts.cursor) {
    // Cursor-based pagination (load older messages)
    const [ref] = await db
      .select({ createdAt: messagesTable.createdAt })
      .from(messagesTable)
      .where(eq(messagesTable.id, opts.cursor))
      .limit(1);

    if (!ref) {
      rows = [];
    } else {
      rows = await db
        .select(MESSAGE_COLUMNS)
        .from(messagesTable)
        .innerJoin(usersTable, eq(messagesTable.authorId, usersTable.id))
        .where(
          and(
            eq(messagesTable.conversationId, conversationId),
            isNull(messagesTable.deletedAt),
            lt(messagesTable.createdAt, ref.createdAt)
          )
        )
        .orderBy(desc(messagesTable.createdAt))
        .limit(limit);
      rows = rows.reverse();
    }
  } else {
    rows = await db
      .select(MESSAGE_COLUMNS)
      .from(messagesTable)
      .innerJoin(usersTable, eq(messagesTable.authorId, usersTable.id))
      .where(
        and(
          eq(messagesTable.conversationId, conversationId),
          isNull(messagesTable.deletedAt)
        )
      )
      .orderBy(desc(messagesTable.createdAt))
      .limit(limit);
    rows = rows.reverse();
  }

  return rows;
}

export async function sendMessage(
  actor: User,
  conversationId: string,
  input: SendMessageInput
): Promise<MessageWithAuthor> {
  if (!await requireConversationAccess(actor, "chat:write", conversationId)) {
    throw new NotFoundError("Conversation not found");
  }

  const data = sendMessageSchema.parse(input);

  const [message] = await db
    .insert(messagesTable)
    .values({
      conversationId,
      authorId: actor.id,
      bodyMd: data.bodyMd,
      replyToId: data.replyToId ?? null,
    })
    .returning();

  // Update conversation updatedAt
  await db
    .update(conversationsTable)
    .set({ updatedAt: new Date() })
    .where(eq(conversationsTable.id, conversationId));

  // Get all member ids for notifications
  const members = await db
    .select({ userId: conversationMembersTable.userId })
    .from(conversationMembersTable)
    .where(eq(conversationMembersTable.conversationId, conversationId));

  await createNewMessageNotifications(
    actor,
    conversationId,
    members.map((m) => m.userId),
    data.bodyMd
  );

  return { ...message, authorDisplayName: actor.displayName };
}

export async function editMessage(
  actor: User,
  messageId: string,
  input: EditMessageInput
): Promise<MessageWithAuthor | null> {
  const data = editMessageSchema.parse(input);

  const [existing] = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.id, messageId))
    .limit(1);

  if (!existing || existing.deletedAt) return null;
  if (!await requireConversationAccess(actor, "chat:write", existing.conversationId)) return null;

  if (existing.authorId !== actor.id && actor.role !== "admin") {
    const { ForbiddenError } = await import("../access");
    throw new ForbiddenError("Cannot edit another user's message");
  }

  const [updated] = await db
    .update(messagesTable)
    .set({ bodyMd: data.bodyMd, editedAt: new Date(), updatedAt: new Date() })
    .where(eq(messagesTable.id, messageId))
    .returning();

  const [author] = await db
    .select({ displayName: usersTable.displayName })
    .from(usersTable)
    .where(eq(usersTable.id, updated.authorId))
    .limit(1);

  return { ...updated, authorDisplayName: author?.displayName ?? null };
}

export async function deleteMessage(
  actor: User,
  messageId: string
): Promise<void> {
  const [existing] = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.id, messageId))
    .limit(1);

  if (!existing || existing.deletedAt) return;
  if (!await requireConversationAccess(actor, "chat:write", existing.conversationId)) return;

  if (existing.authorId !== actor.id && actor.role !== "admin" && actor.role !== "manager") {
    const { ForbiddenError } = await import("../access");
    throw new ForbiddenError("Cannot delete another user's message");
  }

  await db
    .update(messagesTable)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(messagesTable.id, messageId));
}

export async function markRead(
  actor: User,
  conversationId: string,
  messageId: string
): Promise<void> {
  if (!await requireConversationAccess(actor, "chat:read", conversationId)) {
    throw new NotFoundError("Conversation not found");
  }

  await db
    .update(conversationMembersTable)
    .set({ lastReadMessageId: messageId })
    .where(
      and(
        eq(conversationMembersTable.conversationId, conversationId),
        eq(conversationMembersTable.userId, actor.id)
      )
    );
}

export async function getUnreadCount(
  actor: User,
  conversationId: string
): Promise<number> {
  if (!await requireConversationAccess(actor, "chat:read", conversationId)) {
    throw new NotFoundError("Conversation not found");
  }
  const [member] = await db
    .select({ lastReadMessageId: conversationMembersTable.lastReadMessageId })
    .from(conversationMembersTable)
    .where(
      and(
        eq(conversationMembersTable.conversationId, conversationId),
        eq(conversationMembersTable.userId, actor.id)
      )
    )
    .limit(1);

  if (!member) return 0;

  // Only count messages sent by others (not by the actor themselves)
  const { ne } = await import("drizzle-orm");

  if (!member.lastReadMessageId) {
    const rows = await db
      .select({ id: messagesTable.id })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.conversationId, conversationId),
          isNull(messagesTable.deletedAt),
          ne(messagesTable.authorId, actor.id)
        )
      );
    return rows.length;
  }

  const [ref] = await db
    .select({ createdAt: messagesTable.createdAt })
    .from(messagesTable)
    .where(eq(messagesTable.id, member.lastReadMessageId))
    .limit(1);

  if (!ref) return 0;

  const rows = await db
    .select({ id: messagesTable.id })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.conversationId, conversationId),
        isNull(messagesTable.deletedAt),
        gt(messagesTable.createdAt, ref.createdAt),
        ne(messagesTable.authorId, actor.id)
      )
    );

  return rows.length;
}
