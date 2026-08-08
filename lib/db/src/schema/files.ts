import {
  pgTable,
  pgEnum,
  text,
  uuid,
  timestamp,
  integer,
  bigint,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const fileStatusEnum = pgEnum("file_status", [
  "pending",
  "stored",
  "failed",
  "missing",
]);

export const storageLocationEnum = pgEnum("storage_location", [
  "staging",
  "dropbox",
]);

export const fileVisibilityEnum = pgEnum("file_visibility", [
  "internal",
  "external",
]);

/** A single uploaded version of a file document. */
export const filesTable = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** User-visible filename. */
    originalFilename: text("original_filename").notNull(),
    /** MIME type validated against allowlist. */
    mimeType: text("mime_type").notNull(),
    /** File size in bytes. */
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    /** Hex SHA-256 of the raw file bytes. */
    sha256: text("sha256").notNull(),
    /** Hex Dropbox content hash (4 MB block algorithm). */
    contentHash: text("content_hash").notNull(),
    /** Lifecycle status. */
    status: fileStatusEnum("status").notNull().default("pending"),
    /** Where the bytes currently live. */
    storageLocation: storageLocationEnum("storage_location")
      .notNull()
      .default("staging"),
    /** GCS object path (/bucket/path) or Dropbox file ID. */
    storageKey: text("storage_key").notNull(),
    /** Dropbox path (null until transferred). */
    dropboxPath: text("dropbox_path"),
    /** 1-based version number within the document group. */
    versionNo: integer("version_no").notNull().default(1),
    /** Groups all versions of the same logical document. */
    documentGroupId: uuid("document_group_id").notNull(),
    /** Entity this file is directly attached to. */
    entityType: text("entity_type").notNull(), // 'project' | 'task' | 'kb_article'
    entityId: uuid("entity_id").notNull(),
    /** Who uploaded it. */
    uploaderId: uuid("uploader_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    /** Number of Dropbox transfer attempts. */
    retryCount: integer("retry_count").notNull().default(0),
    /** Visibility for guest access. */
    visibility: fileVisibilityEnum("visibility").notNull().default("internal"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("files_entity_idx").on(t.entityType, t.entityId, t.createdAt),
    index("files_status_idx").on(t.status),
    index("files_document_group_idx").on(t.documentGroupId, t.versionNo),
  ]
);

/** Cross-entity links — a single file attached to multiple projects/tasks. */
export const fileLinksTable = pgTable(
  "file_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => filesTable.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    linkedById: uuid("linked_by_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("file_links_entity_idx").on(t.entityType, t.entityId)]
);

export type FileRecord = typeof filesTable.$inferSelect;
export type InsertFileRecord = typeof filesTable.$inferInsert;
export type FileLink = typeof fileLinksTable.$inferSelect;
