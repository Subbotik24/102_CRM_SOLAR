/**
 * KB routes:
 *   GET    /projects/:id/kb                   — list articles for project
 *   POST   /projects/:id/kb                   — create article
 *   GET    /kb/:id                            — get article
 *   PATCH  /kb/:id                            — update article
 *   POST   /kb/:id/publish                   — publish
 *   POST   /kb/:id/archive                   — archive
 *   GET    /kb/:id/versions                  — version history
 *   GET    /projects/:id/kb/search?tag=      — search by tag
 */
import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { handleError } from "./handleError";
import {
  listArticles, getArticle, createArticle, updateArticle,
  publishArticle, archiveArticle, listVersions, searchByTag,
} from "../services/kb";
import { z } from "zod";

const router = Router();

// ── List articles for project ─────────────────────────────────────────────────

router.get("/projects/:id/kb", requireAuth, async (req, res) => {
  try {
    const articles = await listArticles(req.user!, String(req.params.id));
    res.json({ articles });
  } catch (e) {
    handleError(e, res);
  }
});

// ── Create article ────────────────────────────────────────────────────────────

const createArticleSchema = z.object({
  title: z.string().min(1).max(300),
  bodyMd: z.string().default(""),
  tags: z.array(z.string()).default([]),
  parentId: z.string().uuid().optional(),
});

router.post("/projects/:id/kb", requireAuth, async (req, res) => {
  try {
    const parsed = createArticleSchema.safeParse(req.body);
    if (!parsed.success) {
      return void res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    }
    const article = await createArticle(req.user!, {
      projectId: String(req.params.id),
      ...parsed.data,
    });
    res.status(201).json(article);
  } catch (e) {
    handleError(e, res);
  }
});

// ── Get single article ────────────────────────────────────────────────────────

router.get("/kb/:id", requireAuth, async (req, res) => {
  try {
    const article = await getArticle(req.user!, String(req.params.id));
    if (!article) return void res.status(404).json({ error: "Article not found" });
    res.json(article);
  } catch (e) {
    handleError(e, res);
  }
});

// ── Update article ────────────────────────────────────────────────────────────

const updateArticleSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  bodyMd: z.string().optional(),
  tags: z.array(z.string()).optional(),
  parentId: z.string().uuid().nullable().optional(),
});

router.patch("/kb/:id", requireAuth, async (req, res) => {
  try {
    const parsed = updateArticleSchema.safeParse(req.body);
    if (!parsed.success) {
      return void res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    }
    const article = await updateArticle(req.user!, String(req.params.id), parsed.data);
    res.json(article);
  } catch (e) {
    handleError(e, res);
  }
});

// ── Publish / Archive ─────────────────────────────────────────────────────────

router.post("/kb/:id/publish", requireAuth, async (req, res) => {
  try {
    const article = await publishArticle(req.user!, String(req.params.id));
    res.json(article);
  } catch (e) {
    handleError(e, res);
  }
});

router.post("/kb/:id/archive", requireAuth, async (req, res) => {
  try {
    const article = await archiveArticle(req.user!, String(req.params.id));
    res.json(article);
  } catch (e) {
    handleError(e, res);
  }
});

// ── Version history ───────────────────────────────────────────────────────────

router.get("/kb/:id/versions", requireAuth, async (req, res) => {
  try {
    const versions = await listVersions(req.user!, String(req.params.id));
    res.json({ versions });
  } catch (e) {
    handleError(e, res);
  }
});

// ── Search by tag ─────────────────────────────────────────────────────────────

router.get("/projects/:id/kb/search", requireAuth, async (req, res) => {
  try {
    const tag = String(req.query.tag ?? "");
    if (!tag) return void res.status(400).json({ error: "tag query param required" });
    const articles = await searchByTag(req.user!, String(req.params.id), tag);
    res.json({ articles });
  } catch (e) {
    handleError(e, res);
  }
});

export default router;
