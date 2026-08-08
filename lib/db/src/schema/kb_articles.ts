import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  pgEnum,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { projectsTable } from "./projects";

export const kbArticleStatusEnum = pgEnum("kb_article_status", [
  "draft",
  "published",
  "archived",
]);

export const kbArticlesTable = pgTable(
  "kb_articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    // Dot-separated path for tree navigation, e.g. "root.child.grandchild"
    path: text("path").notNull().default(""),
    depth: integer("depth").notNull().default(0),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull().default(""),
    bodyHtml: text("body_html").notNull().default(""),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    status: kbArticleStatusEnum("status").notNull().default("draft"),
    // search_tsv is managed by a DB trigger (see migration)
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    updatedById: uuid("updated_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("kb_articles_depth_check", sql`${t.depth} >= 0 AND ${t.depth} <= 3`),
    index("kb_articles_project_status_idx").on(t.projectId, t.status),
    index("kb_articles_path_idx").on(t.path),
    // `tags` is text[], so the default GIN array_ops applies. It previously
    // named gin__int_ops — the integer-array opclass from the `intarray`
    // extension — which made `drizzle-kit push` fail on a clean database.
    index("kb_articles_tags_idx").using("gin", t.tags),
  ]
);

export type KbArticle = typeof kbArticlesTable.$inferSelect;
export type InsertKbArticle = typeof kbArticlesTable.$inferInsert;
