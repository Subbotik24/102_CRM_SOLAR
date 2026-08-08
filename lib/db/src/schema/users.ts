import {
  pgTable,
  text,
  uuid,
  timestamp,
  pgEnum,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { customType } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// citext: case-insensitive text — requires CREATE EXTENSION IF NOT EXISTS citext (run via seed/migration)
const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return "citext";
  },
});

export const roleEnum = pgEnum("user_role", [
  "admin",
  "manager",
  "member",
  "guest",
]);

export const localeEnum = pgEnum("user_locale", ["uk", "cs"]);

export const userStatusEnum = pgEnum("user_status", ["active", "suspended"]);

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: citext("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  position: text("position"),
  descriptionMd: text("description_md"),
  role: roleEnum("role").notNull().default("member"),
  locale: localeEnum("locale").notNull().default("uk"),
  timezone: text("timezone").notNull().default("Europe/Kyiv"),
  status: userStatusEnum("status").notNull().default("active"),
  avatarKey: text("avatar_key").notNull().default("1"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const invitationsTable = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  role: roleEnum("role").notNull().default("member"),
  // Stored so accepted users receive the language selected by the inviter.
  locale: localeEnum("locale").notNull().default("uk"),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  invitedById: uuid("invited_by_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userPreferencesTable = pgTable(
  "user_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique().on(t.userId, t.key)]
);

export type User = typeof usersTable.$inferSelect;
export type Invitation = typeof invitationsTable.$inferSelect;
export type UserPreference = typeof userPreferencesTable.$inferSelect;

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
