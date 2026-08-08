import { Router } from "express";
import { handleError } from "./handleError";
import { requireAuth } from "../middleware/requireAuth";
import {
  createProject,
  listProjects,
  getProjectById,
  getProjectForActor,
  listProjectSubtree,
  updateProject,
  archiveProject,
  restoreProject,
  deleteProject,
  moveProject,
  listProjectMembers,
  addProjectMember,
  removeProjectMember,
  createProjectSchema,
  updateProjectSchema,
  moveProjectSchema,
  addMemberSchema,
} from "../services/projects";
import {
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  archiveTask,
  getTaskById,
  getTaskForActor,
  getTaskPendingDeletion,
  listProjectTasks,
  listAllTasks,
  createTaskSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
  listTasksQuerySchema,
} from "../services/tasks";
import {
  listStages,
  createStage,
  updateStage,
  deleteStage,
  completeStage,
  reorderStages,
  createStageSchema,
  updateStageSchema,
  reorderStagesSchema,
} from "../services/stages";
import {
  listInfoBlocks,
  createInfoBlock,
  updateInfoBlock,
  deleteInfoBlock,
  createInfoBlockSchema,
  updateInfoBlockSchema,
} from "../services/projectInfoBlocks";
import {
  listChecklistItems,
  createChecklistItem,
  updateChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
  createChecklistItemSchema,
  updateChecklistItemSchema,
} from "../services/checklist";
import { listProjectJournal } from "../services/journal";
import {
  createDeletionRequest,
  approveDeletionRequest,
  rejectDeletionRequest,
} from "../services/deletionRequests";
import { db, usersTable } from "@workspace/db";
import { asc, ilike, or } from "drizzle-orm";

const router = Router();

// Bounds for the global task list. The Kanban board asks for 500; anything
// beyond that is a client bug or an attempt to dump the table.
const DEFAULT_TASK_PAGE = 50;
const MAX_TASK_PAGE = 500;

// ── Users (lightweight, for pickers) ────────────────────────────────────────
// Returns basic user info to all authenticated users (not just admins).
router.get("/users", requireAuth, async (req, res): Promise<void> => {
  try {
    // Guests are not allowed to enumerate users
    if (req.user!.role === "guest") {
      res.status(403).json({ error: "Guests cannot list users" });
      return;
    }
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const rows = await db
      .select({
        id: usersTable.id,
        displayName: usersTable.displayName,
        email: usersTable.email,
        role: usersTable.role,
        avatarKey: usersTable.avatarKey,
      })
      .from(usersTable)
      .where(
        q
          ? or(ilike(usersTable.displayName, `%${q}%`), ilike(usersTable.email, `%${q}%`))
          : undefined
      )
      .orderBy(asc(usersTable.displayName));
    res.json({ users: rows });
  } catch (err) {
    handleError(err, res);
  }
});

// ── Projects ────────────────────────────────────────────────────────────────

router.get("/projects", requireAuth, async (req, res): Promise<void> => {
  try {
    const projects = await listProjects(req.user!, { archived: req.query.archived === "true" });
    res.json({ projects });
  } catch (err) {
    handleError(err, res);
  }
});

router.post("/projects", requireAuth, async (req, res): Promise<void> => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", issues: parsed.error.issues });
    return;
  }
  try {
    const project = await createProject(req.user!, parsed.data);
    res.status(201).json(project);
  } catch (err) {
    handleError(err, res);
  }
});

router.get("/projects/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    const project = await getProjectForActor(req.user!, req.params.id as string);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    res.json(project);
  } catch (err) {
    handleError(err, res);
  }
});

router.patch("/projects/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = updateProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", issues: parsed.error.issues });
    return;
  }
  try {
    const project = await updateProject(req.user!, req.params.id as string, parsed.data);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    res.json(project);
  } catch (err) {
    handleError(err, res);
  }
});

// Global tasks — GET /api/tasks?assigneeId=&status=&limit=
router.get("/tasks", requireAuth, async (req, res): Promise<void> => {
  try {
    const assigneeId = typeof req.query.assigneeId === "string" ? req.query.assigneeId : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    // `limit` was passed straight to SQL: "999999" dumped the whole task table
    // in one response, and "abc" / "-5" reached the query as NaN / negative.
    const parsedLimit = Number(req.query.limit);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(Math.trunc(parsedLimit), 1), MAX_TASK_PAGE)
      : DEFAULT_TASK_PAGE;
    const tasks = await listAllTasks(req.user!, { assigneeId, status, limit });
    res.json({ tasks });
  } catch (err) {
    handleError(err, res);
  }
});

router.delete("/projects/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    await deleteProject(req.user!, req.params.id as string);
    res.status(204).end();
  } catch (err) {
    handleError(err, res);
  }
});

router.post("/projects/:id/archive", requireAuth, async (req, res): Promise<void> => {
  try {
    const project = await archiveProject(req.user!, req.params.id as string);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    res.json(project);
  } catch (err) {
    handleError(err, res);
  }
});

router.post("/projects/:id/restore", requireAuth, async (req, res): Promise<void> => {
  try {
    const project = await restoreProject(req.user!, req.params.id as string);
    if (!project) { res.status(404).json({ error: "Project not found or not archived" }); return; }
    res.json(project);
  } catch (err) {
    handleError(err, res);
  }
});

router.post("/projects/:id/move", requireAuth, async (req, res): Promise<void> => {
  const parsed = moveProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", issues: parsed.error.issues });
    return;
  }
  try {
    const project = await moveProject(req.user!, req.params.id as string, parsed.data);
    res.json(project);
  } catch (err) {
    handleError(err, res);
  }
});

router.get("/projects/:id/subtree", requireAuth, async (req, res): Promise<void> => {
  try {
    const projects = await listProjectSubtree(req.user!, req.params.id as string);
    res.json({ projects });
  } catch (err) {
    handleError(err, res);
  }
});

// ── Members ────────────────────────────────────────────────────────────────

/** Aggregate: all project members across all projects the actor can read. */
router.get("/projects/members/all", requireAuth, async (req, res): Promise<void> => {
  try {
    const projects = await listProjects(req.user!);
    const results = await Promise.all(
      projects.map((p) =>
        listProjectMembers(req.user!, p.id).then((members) =>
          members.map((m) => ({
            ...m,
            projectName: p.name,
            projectCode: p.code,
          }))
        )
      )
    );
    const members = results.flat();
    res.json({ members });
  } catch (err) {
    handleError(err, res);
  }
});

router.get("/projects/:id/members", requireAuth, async (req, res): Promise<void> => {
  try {
    const members = await listProjectMembers(req.user!, req.params.id as string);
    res.json({ members });
  } catch (err) {
    handleError(err, res);
  }
});

router.post("/projects/:id/members", requireAuth, async (req, res): Promise<void> => {
  const parsed = addMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  try {
    const member = await addProjectMember(req.user!, req.params.id as string, parsed.data);
    res.status(201).json(member);
  } catch (err) {
    handleError(err, res);
  }
});

router.delete("/projects/:id/members/:userId", requireAuth, async (req, res): Promise<void> => {
  try {
    await removeProjectMember(req.user!, req.params.id as string, req.params.userId as string);
    res.status(204).send();
  } catch (err) {
    handleError(err, res);
  }
});

// ── Stages ─────────────────────────────────────────────────────────────────

router.get("/projects/:id/stages", requireAuth, async (req, res): Promise<void> => {
  try {
    const stages = await listStages(req.user!, req.params.id as string);
    res.json({ stages });
  } catch (err) {
    handleError(err, res);
  }
});

router.post("/projects/:id/stages", requireAuth, async (req, res): Promise<void> => {
  const parsed = createStageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  try {
    const stage = await createStage(req.user!, req.params.id as string, parsed.data);
    res.status(201).json(stage);
  } catch (err) {
    handleError(err, res);
  }
});

router.post("/projects/:id/stages/reorder", requireAuth, async (req, res): Promise<void> => {
  const parsed = reorderStagesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  try {
    const stages = await reorderStages(req.user!, req.params.id as string, parsed.data.orderedIds);
    res.json({ stages });
  } catch (err) {
    handleError(err, res);
  }
});

router.patch("/stages/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = updateStageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  try {
    const stage = await updateStage(req.user!, req.params.id as string, parsed.data);
    if (!stage) { res.status(404).json({ error: "Stage not found" }); return; }
    res.json(stage);
  } catch (err) {
    handleError(err, res);
  }
});

router.delete("/stages/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    await deleteStage(req.user!, req.params.id as string);
    res.status(204).send();
  } catch (err) {
    handleError(err, res);
  }
});

router.post("/stages/:id/complete", requireAuth, async (req, res): Promise<void> => {
  try {
    const stage = await completeStage(req.user!, req.params.id as string);
    if (!stage) { res.status(404).json({ error: "Stage not found" }); return; }
    res.json(stage);
  } catch (err) {
    handleError(err, res);
  }
});

// ── Info blocks ──────────────────────────────────────────────────────────

router.get("/projects/:id/info-blocks", requireAuth, async (req, res): Promise<void> => {
  try {
    const blocks = await listInfoBlocks(req.user!, req.params.id as string);
    res.json({ blocks });
  } catch (err) {
    handleError(err, res);
  }
});

router.post("/projects/:id/info-blocks", requireAuth, async (req, res): Promise<void> => {
  const parsed = createInfoBlockSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  try {
    const block = await createInfoBlock(req.user!, req.params.id as string, parsed.data);
    res.status(201).json(block);
  } catch (err) {
    handleError(err, res);
  }
});

router.patch("/info-blocks/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = updateInfoBlockSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  try {
    const block = await updateInfoBlock(req.user!, req.params.id as string, parsed.data);
    if (!block) { res.status(404).json({ error: "Info block not found" }); return; }
    res.json(block);
  } catch (err) {
    handleError(err, res);
  }
});

router.delete("/info-blocks/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    await deleteInfoBlock(req.user!, req.params.id as string);
    res.status(204).send();
  } catch (err) {
    handleError(err, res);
  }
});

// ── Tasks ─────────────────────────────────────────────────────────────────

router.get("/projects/:id/tasks", requireAuth, async (req, res): Promise<void> => {
  try {
    const project = await getProjectForActor(req.user!, req.params.id as string);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    const queryParsed = listTasksQuerySchema.safeParse({
      status: req.query.status,
      priority: req.query.priority,
      assigneeId: req.query.assigneeId,
      stageId: req.query.stageId,
      parentTaskId: req.query.parentTaskId,
      rootOnly: req.query.rootOnly === "true",
      limit: req.query.limit !== undefined ? Number(req.query.limit) : undefined,
      offset: req.query.offset !== undefined ? Number(req.query.offset) : undefined,
      includeSubprojects: req.query.includeSubprojects === "true",
    });
    if (!queryParsed.success) {
      res.status(400).json({ error: "Invalid query parameters", code: "validation_error", issues: queryParsed.error.issues });
      return;
    }
    res.json(await listProjectTasks(req.user!, project.id, queryParsed.data));
  } catch (err) {
    handleError(err, res);
  }
});

router.post("/projects/:id/tasks", requireAuth, async (req, res): Promise<void> => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", issues: parsed.error.issues });
    return;
  }
  try {
    const project = await getProjectById(req.params.id as string);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    const task = await createTask(req.user!, project, parsed.data);
    res.status(201).json(task);
  } catch (err) {
    handleError(err, res);
  }
});

router.get("/tasks/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    const task = await getTaskForActor(req.user!, req.params.id as string);
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }
    const pendingDeletion = await getTaskPendingDeletion(task.id);
    res.json({ ...task, pendingDeletion });
  } catch (err) {
    handleError(err, res);
  }
});

router.patch("/tasks/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", issues: parsed.error.issues });
    return;
  }
  try {
    const task = await updateTask(req.user!, req.params.id as string, parsed.data);
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }
    res.json(task);
  } catch (err) {
    handleError(err, res);
  }
});

router.patch("/tasks/:id/status", requireAuth, async (req, res): Promise<void> => {
  const parsed = updateTaskStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid status value" });
    return;
  }
  try {
    const task = await updateTaskStatus(req.user!, req.params.id as string, parsed.data.status);
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }
    res.json(task);
  } catch (err) {
    handleError(err, res);
  }
});

router.delete("/tasks/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    const actor = req.user!;
    const task = await getTaskById(req.params.id as string);
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }

    if (actor.role === "admin") {
      await deleteTask(actor, task.id);
      res.status(204).send();
      return;
    }

    await createDeletionRequest(actor, "task", task.id, task.title, task.projectId);
    res.status(202).json({ status: "pending" });
  } catch (err) {
    handleError(err, res);
  }
});

router.post("/deletion-requests/:id/approve", requireAuth, async (req, res): Promise<void> => {
  try {
    await approveDeletionRequest(req.user!, req.params.id as string);
    res.status(204).send();
  } catch (err) {
    handleError(err, res);
  }
});

router.post("/deletion-requests/:id/reject", requireAuth, async (req, res): Promise<void> => {
  try {
    await rejectDeletionRequest(req.user!, req.params.id as string);
    res.status(204).send();
  } catch (err) {
    handleError(err, res);
  }
});

router.post("/tasks/:id/archive", requireAuth, async (req, res): Promise<void> => {
  try {
    const task = await archiveTask(req.user!, req.params.id as string);
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }
    res.json(task);
  } catch (err) {
    handleError(err, res);
  }
});

// ── Checklist ──────────────────────────────────────────────────────────────

router.get("/tasks/:id/checklist", requireAuth, async (req, res): Promise<void> => {
  try {
    const items = await listChecklistItems(req.user!, req.params.id as string);
    res.json({ items });
  } catch (err) {
    handleError(err, res);
  }
});

router.post("/tasks/:id/checklist", requireAuth, async (req, res): Promise<void> => {
  const parsed = createChecklistItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  try {
    const item = await createChecklistItem(req.user!, req.params.id as string, parsed.data);
    res.status(201).json(item);
  } catch (err) {
    handleError(err, res);
  }
});

router.patch("/checklist/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = updateChecklistItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  try {
    const item = await updateChecklistItem(req.user!, req.params.id as string, parsed.data);
    if (!item) { res.status(404).json({ error: "Item not found" }); return; }
    res.json(item);
  } catch (err) {
    handleError(err, res);
  }
});

router.delete("/checklist/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    await deleteChecklistItem(req.user!, req.params.id as string);
    res.status(204).send();
  } catch (err) {
    handleError(err, res);
  }
});

router.post("/checklist/:id/toggle", requireAuth, async (req, res): Promise<void> => {
  try {
    const item = await toggleChecklistItem(req.user!, req.params.id as string);
    if (!item) { res.status(404).json({ error: "Item not found" }); return; }
    res.json(item);
  } catch (err) {
    handleError(err, res);
  }
});

// ── Journal ────────────────────────────────────────────────────────────────

router.get("/projects/:id/journal", requireAuth, async (req, res): Promise<void> => {
  try {
    const project = await getProjectById(req.params.id as string);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const eventTypes =
      typeof req.query.eventTypes === "string"
        ? req.query.eventTypes.split(",").filter(Boolean)
        : Array.isArray(req.query.eventTypes)
        ? (req.query.eventTypes as string[])
        : undefined;
    const page = await listProjectJournal(req.user!, project.id, cursor, {
      eventTypes,
      actorId: typeof req.query.actorId === "string" ? req.query.actorId : undefined,
      dateFrom: typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === "string" ? req.query.dateTo : undefined,
      includeSubprojects: req.query.includeSubprojects === "true",
    });
    res.json(page);
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
