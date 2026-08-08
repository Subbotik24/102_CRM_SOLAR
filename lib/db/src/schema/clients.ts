import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

    export const clientsTable = pgTable(
    "clients",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      name: text("name").notNull(),
      website: text("website"),
      industry: text("industry"),
      /** Visible to admin/manager only — projected away from member/guest responses. */
      internalNote: text("internal_note"),
      avatarKey: text("avatar_key").notNull().default("1"),
      archivedAt: timestamp("archived_at", { withTimezone: true }),
      createdAt: timestamp("created_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
    },
    (t) => [index("clients_name_idx").on(t.name)]
    );

    export const contactsTable = pgTable(
    "contacts",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      clientId: uuid("client_id")
        .notNull()
        .references(() => clientsTable.id, { onDelete: "cascade" }),
      firstName: text("first_name").notNull(),
      lastName: text("last_name"),
      email: text("email"),
      phone: text("phone"),
      position: text("position"),
      /** Visible to admin/manager only — projected away from member/guest responses. */
      internalNote: text("internal_note"),
      archivedAt: timestamp("archived_at", { withTimezone: true }),
      createdAt: timestamp("created_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
    },
    (t) => [index("contacts_client_idx").on(t.clientId)]
    );

    export type Client = typeof clientsTable.$inferSelect;
    export type InsertClient = typeof clientsTable.$inferInsert;
    export type Contact = typeof contactsTable.$inferSelect;
    export type InsertContact = typeof contactsTable.$inferInsert;

    /** Client with internalNote stripped — safe for member/guest responses */
    export type ClientPublic = Omit<Client, "internalNote">;
    /** Contact with internalNote stripped — safe for member/guest responses */
    export type ContactPublic = Omit<Contact, "internalNote">;
    