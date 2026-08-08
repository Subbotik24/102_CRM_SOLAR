import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { kbArticlesTable } from "./kb_articles";

export const kbArticleVersionsTable = pgTable(
  "kb_article_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => kbArticlesTable.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull().default(1),
    bodyMd: text("body_md").notNull(),
    bodyHtml: text("body_html").notNull(),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("kb_article_versions_article_idx").on(t.articleId, t.versionNo),
  ]
);

export type KbArticleVersion = typeof kbArticleVersionsTable.$inferSelect;
export type InsertKbArticleVersion = typeof kbArticleVersionsTable.$inferInsert;
