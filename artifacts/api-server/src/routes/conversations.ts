import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { handleError } from "./handleError";
import { db, usersTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import {
  createDirectConversation,
  createProjectConversation,
  listConversations,
  getConversation,
  addConversationMember,
  listConversationMembers,
  listMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  markRead,
  getUnreadCount,
  sendMessageSchema,
  editMessageSchema,
} from "../services/conversations";
import {
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  mentionSearch,
  listDueTasksForUser,
} from "../services/notifications";
import { z } from "zod";

const router = Router();

// ── Mention search ───────────────────────────────────────────────────────────
router.get("/users/mention-search", requireAuth, async (req, res): Promise<void> => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const results = await mentionSearch(req.user!, q);
    res.json({ users: results });
  } catch (err) {
    handleError(err, res);
  }
});

// ── Conversations ────────────────────────────────────────────────────────────
router.get("/conversations", requireAuth, async (req, res): Promise<void> => {
  try {
    const conversations = await listConversations(req.user!);
    res.json({ conversations });
  } catch (err) {
    handleError(err, res);
  }
});

router.post("/conversations/direct", requireAuth, async (req, res): Promise<void> => {
  const parsed = z.object({ otherUserId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", issues: parsed.error.issues });
    return;
  }
  try {
    const conv = await createDirectConversation(req.user!, parsed.data.otherUserId);
    res.status(201).json(conv);
  } catch (err) {
    handleError(err, res);
  }
});

router.post("/conversations/project", requireAuth, async (req, res): Promise<void> => {
  const parsed = z
    .object({ projectId: z.string().uuid(), title: z.string().min(1).max(200) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", issues: parsed.error.issues });
    return;
  }
  try {
    const conv = await createProjectConversation(
      req.user!,
      parsed.data.projectId,
      parsed.data.title
    );
    res.status(201).json(conv);
  } catch (err) {
    handleError(err, res);
  }
});

router.get("/conversations/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    const conv = await getConversation(req.user!, req.params.id as string);
    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
    res.json(conv);
  } catch (err) {
    handleError(err, res);
  }
});

router.get("/conversations/:id/members", requireAuth, async (req, res): Promise<void> => {
  try {
    const members = await listConversationMembers(req.user!, req.params.id as string);
    res.json({ members });
  } catch (err) {
    handleError(err, res);
  }
});

router.post("/conversations/:id/members", requireAuth, async (req, res): Promise<void> => {
  const parsed = z.object({ userId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", issues: parsed.error.issues });
    return;
  }
  try {
    await addConversationMember(req.user!, req.params.id as string, parsed.data.userId);
    res.status(204).end();
  } catch (err) {
    handleError(err, res);
  }
});

// ── Messages ─────────────────────────────────────────────────────────────────
router.get("/conversations/:id/messages", requireAuth, async (req, res): Promise<void> => {
  try {
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const after = typeof req.query.after === "string" ? req.query.after : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const messages = await listMessages(req.user!, req.params.id as string, {
      cursor,
      after,
      limit,
    });
    // Enrich with author display names
    const authorIds = [...new Set(messages.map((m) => m.authorId))];
    const users = authorIds.length > 0
      ? await db.select({ id: usersTable.id, displayName: usersTable.displayName })
          .from(usersTable).where(inArray(usersTable.id, authorIds))
      : [];
    const userMap = new Map(users.map((u) => [u.id, u.displayName]));
    const enriched = messages.map((m) => ({ ...m, authorDisplayName: userMap.get(m.authorId) ?? null }));
    res.json({ messages: enriched });
  } catch (err) {
    handleError(err, res);
  }
});

router.post("/conversations/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", issues: parsed.error.issues });
    return;
  }
  try {
    const message = await sendMessage(req.user!, req.params.id as string, parsed.data);
    res.status(201).json(message);
  } catch (err) {
    handleError(err, res);
  }
});

router.patch("/messages/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = editMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", issues: parsed.error.issues });
    return;
  }
  try {
    const message = await editMessage(req.user!, req.params.id as string, parsed.data);
    if (!message) { res.status(404).json({ error: "Message not found" }); return; }
    res.json(message);
  } catch (err) {
    handleError(err, res);
  }
});

router.delete("/messages/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    await deleteMessage(req.user!, req.params.id as string);
    res.status(204).end();
  } catch (err) {
    handleError(err, res);
  }
});

router.post("/conversations/:id/mark-read", requireAuth, async (req, res): Promise<void> => {
  const parsed = z.object({ messageId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", issues: parsed.error.issues });
    return;
  }
  try {
    await markRead(req.user!, req.params.id as string, parsed.data.messageId);
    res.status(204).end();
  } catch (err) {
    handleError(err, res);
  }
});

router.get("/conversations/:id/unread-count", requireAuth, async (req, res): Promise<void> => {
  try {
    const count = await getUnreadCount(req.user!, req.params.id as string);
    res.json({ count });
  } catch (err) {
    handleError(err, res);
  }
});

// ── Notifications ─────────────────────────────────────────────────────────────
router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  try {
    const notifications = await listNotifications(req.user!);
    const unreadCount = await countUnreadNotifications(req.user!);
    const dueTasks = await listDueTasksForUser(req.user!);
    // Due tasks are actionable work, not unread messages. Keeping the counts
    // separate lets "mark all read" truthfully clear notification unread state.
    const dueTaskCount = dueTasks.length;
    res.json({
      notifications,
      unreadCount,
      dueTasks,
      dueTaskCount,
      attentionCount: unreadCount + dueTaskCount,
    });
  } catch (err) {
    handleError(err, res);
  }
});

router.post("/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  try {
    await markNotificationRead(req.user!, req.params.id as string);
    res.status(204).end();
  } catch (err) {
    handleError(err, res);
  }
});

router.post("/notifications/mark-all-read", requireAuth, async (req, res): Promise<void> => {
  try {
    await markAllNotificationsRead(req.user!);
    res.status(204).end();
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
