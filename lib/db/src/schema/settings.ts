import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Application-wide key-value settings. Sensitive values are AES-256-GCM encrypted. */
export const settingsTable = pgTable("settings", {
  key: text("key").primaryKey(),
  /** Raw text or base64-encoded AES-GCM ciphertext. */
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Setting = typeof settingsTable.$inferSelect;
