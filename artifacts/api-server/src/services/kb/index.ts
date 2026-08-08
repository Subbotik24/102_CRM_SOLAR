/**
 * Knowledge Base service.
 *
 * Access model:
 *  - Guests: 403 for all KB operations
 *  - Members / Managers / Admins: read
 *  - Managers / Admins: write (create, update, publish, archive)
 */
import { db, kbArticlesTable, kbArticleVersionsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import type { User, KbArticle, KbArticleVersion } from "@workspace/db";
import { ForbiddenError } from "../access";
import { requireProjectAccess } from "../access/projectAccess";
import { renderMarkdown as renderBody } from "../../lib/markdown";
import { NotFoundError, ValidationError } from "../errors";
import { emitActivity } from "../activity";

export { type KbArticle, type KbArticleVersion };

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function requireKbRead(actor: User, projectId: string): Promise<void> {
  if (actor.role === "guest") throw new ForbiddenError("Guests do not have access to the knowledge base");
  await requireProjectAccess(actor, "kb:read", projectId);
}

async function requireKbWrite(actor: User, projectId: string): Promise<void> {
  if (actor.role === "guest") throw new ForbiddenError("Guests do not have access to the knowledge base");
  await requireProjectAccess(actor, "kb:write", projectId);
}

async function getArticleForAccess(articleId: string): Promise<KbArticle | null> {
  const [article] = await db.select().from(kbArticlesTable).where(eq(kbArticlesTable.id, articleId)).limit(1);
  return article ?? null;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

/** List all non-archived articles for a project, ordered by depth then title. */
export async function listArticles(actor: User, projectId: string): Promise<KbArticle[]> {
  await requireKbRead(actor, projectId);
  return db
    .select()
    .from(kbArticlesTable)
    .where(
      and(
        eq(kbArticlesTable.projectId, projectId),
        sql`${kbArticlesTable.status} != 'archived'`
      )
    )
    .orderBy(kbArticlesTable.depth, kbArticlesTable.title);
}

/** Get a single article. Returns null if not found. */
export async function getArticle(actor: User, articleId: string): Promise<KbArticle | null> {
  const article = await getArticleForAccess(articleId);
  if (!article) return null;
  await requireKbRead(actor, article.projectId);
  return article;
}

/** Create a new KB article. */
export async function createArticle(
  actor: User,
  {
    projectId,
    parentId,
    title,
    bodyMd = "",
    tags = [],
  }: {
    projectId: string;
    parentId?: string;
    title: string;
    bodyMd?: string;
    tags?: string[];
  }
): Promise<KbArticle> {
  await requireKbWrite(actor, projectId);

  let depth = 0;
  let path = "";

  if (parentId) {
    const [parent] = await db
      .select({ depth: kbArticlesTable.depth, path: kbArticlesTable.path, projectId: kbArticlesTable.projectId })
      .from(kbArticlesTable)
      .where(eq(kbArticlesTable.id, parentId))
      .limit(1);
    if (!parent) throw new NotFoundError("Parent article not found");
    if (parent.projectId !== projectId) throw new ValidationError("Parent article belongs to a different project");
    if (parent.depth >= 3) throw new ValidationError("Maximum KB depth (3) reached");
    depth = parent.depth + 1;
    path = parent.path ? `${parent.path}.${articleId()}` : articleId();
  }

  const bodyHtml = renderBody(bodyMd);
  return db.transaction(async (tx) => {
    const [article] = await tx
      .insert(kbArticlesTable)
      .values({
        projectId,
        parentId: parentId ?? null,
        path: path || articleId(),
        depth,
        title,
        bodyMd,
        bodyHtml,
        tags,
        status: "draft",
        createdById: actor.id,
        updatedById: actor.id,
      })
      .returning();
    await tx.insert(kbArticleVersionsTable).values({
      articleId: article.id,
      versionNo: 1,
      bodyMd,
      bodyHtml,
      tags,
      createdById: actor.id,
    });
    await emitActivity(tx, {
      projectId,
      entityType: "kb_article",
      entityId: article.id,
      actorId: actor.id,
      eventType: "kb.created",
      payload: { articleId: article.id, title: article.title },
    });
    return article;
  });
}

/** Helper to generate a short path segment */
function articleId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Update article. Writes a new version if bodyMd changed. */
export async function updateArticle(
  actor: User,
  articleId: string,
  updates: {
    title?: string;
    bodyMd?: string;
    tags?: string[];
    parentId?: string | null;
  }
): Promise<KbArticle> {
  const existing = await getArticleForAccess(articleId);
  if (!existing) throw new NotFoundError("Article not found");
  await requireKbWrite(actor, existing.projectId);

  const bodyMd = updates.bodyMd ?? existing.bodyMd;
  const bodyHtml = renderBody(bodyMd);

  return db.transaction(async (tx) => {
    if (updates.bodyMd !== undefined && updates.bodyMd !== existing.bodyMd) {
      const [latest] = await tx
        .select({ versionNo: kbArticleVersionsTable.versionNo })
        .from(kbArticleVersionsTable)
        .where(eq(kbArticleVersionsTable.articleId, articleId))
        .orderBy(desc(kbArticleVersionsTable.versionNo))
        .limit(1);
      await tx.insert(kbArticleVersionsTable).values({
        articleId,
        versionNo: (latest?.versionNo ?? 0) + 1,
        bodyMd,
        bodyHtml,
        tags: updates.tags ?? existing.tags,
        createdById: actor.id,
      });
    }
    const [updated] = await tx
      .update(kbArticlesTable)
      .set({ title: updates.title ?? existing.title, bodyMd, bodyHtml, tags: updates.tags ?? existing.tags, updatedById: actor.id, updatedAt: new Date() })
      .where(eq(kbArticlesTable.id, articleId))
      .returning();
    await emitActivity(tx, { projectId: existing.projectId, entityType: "kb_article", entityId: articleId, actorId: actor.id, eventType: "kb.updated", payload: { articleId } });
    return updated;
  });
}

/** Publish an article (draft → published). */
export async function publishArticle(actor: User, articleId: string): Promise<KbArticle> {
  const existing = await getArticleForAccess(articleId);
  if (!existing) throw new NotFoundError("Article not found");
  await requireKbWrite(actor, existing.projectId);
  const updated = await db.transaction(async (tx) => {
    const [article] = await tx.update(kbArticlesTable).set({ status: "published", publishedAt: new Date(), updatedAt: new Date() }).where(eq(kbArticlesTable.id, articleId)).returning();
    if (article) await emitActivity(tx, { projectId: existing.projectId, entityType: "kb_article", entityId: articleId, actorId: actor.id, eventType: "kb.published", payload: { articleId } });
    return article;
  });
  if (!updated) throw new NotFoundError("Article not found");
  return updated;
}

/** Archive an article. */
export async function archiveArticle(actor: User, articleId: string): Promise<KbArticle> {
  const existing = await getArticleForAccess(articleId);
  if (!existing) throw new NotFoundError("Article not found");
  await requireKbWrite(actor, existing.projectId);
  const updated = await db.transaction(async (tx) => {
    const [article] = await tx.update(kbArticlesTable).set({ status: "archived", updatedAt: new Date() }).where(eq(kbArticlesTable.id, articleId)).returning();
    if (article) await emitActivity(tx, { projectId: existing.projectId, entityType: "kb_article", entityId: articleId, actorId: actor.id, eventType: "kb.archived", payload: { articleId } });
    return article;
  });
  if (!updated) throw new NotFoundError("Article not found");
  return updated;
}

/** List version history for an article. */
export async function listVersions(actor: User, articleId: string): Promise<KbArticleVersion[]> {
  const article = await getArticleForAccess(articleId);
  if (!article) return [];
  await requireKbRead(actor, article.projectId);
  return db
    .select()
    .from(kbArticleVersionsTable)
    .where(eq(kbArticleVersionsTable.articleId, articleId))
    .orderBy(desc(kbArticleVersionsTable.versionNo));
}

/** Search articles by tag. */
export async function searchByTag(actor: User, projectId: string, tag: string): Promise<KbArticle[]> {
  await requireKbRead(actor, projectId);
  return db
    .select()
    .from(kbArticlesTable)
    .where(
      and(
        eq(kbArticlesTable.projectId, projectId),
        sql`${tag} = ANY(${kbArticlesTable.tags})`
      )
    )
    .orderBy(kbArticlesTable.title);
}
