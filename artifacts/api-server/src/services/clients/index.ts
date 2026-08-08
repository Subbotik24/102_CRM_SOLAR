import { db, clientsTable, contactsTable, projectsTable } from "@workspace/db";
    import { eq, isNull, inArray } from "drizzle-orm";
    import type { User, Client, Contact, ClientPublic, ContactPublic } from "@workspace/db";
    import { authorize } from "../access";
    import { z } from "zod";

    export { type Client, type Contact, type ClientPublic, type ContactPublic };

    // ── Projection ──────────────────────────────────────────────────────────────

    /** Strip internalNote for roles that cannot see it. */
    function projectClient(actor: User, client: Client): ClientPublic | Client {
    if (actor.role === "admin" || actor.role === "manager") return client;
    const { internalNote: _stripped, ...pub } = client;
    return pub;
    }

    function projectContact(actor: User, contact: Contact): ContactPublic | Contact {
    if (actor.role === "admin" || actor.role === "manager") return contact;
    const { internalNote: _stripped, ...pub } = contact;
    return pub;
    }

    // ── Schemas ─────────────────────────────────────────────────────────────────

    export const createClientSchema = z.object({
    name: z.string().min(1).max(200),
    website: z.string().optional(),
    industry: z.string().max(100).optional(),
    internalNote: z.string().optional(),
    });

    export const updateClientSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    website: z.string().optional().nullable(),
    industry: z.string().max(100).optional().nullable(),
    internalNote: z.string().optional().nullable(),
    avatarKey: z.enum(['1','2','3','4','5','6']).optional(),
    });

    export const createContactSchema = z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().max(100).optional(),
    email: z.string().max(200).optional(),
    phone: z.string().max(50).optional(),
    position: z.string().max(100).optional(),
    internalNote: z.string().optional(),
    });

    export const updateContactSchema = z.object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().max(100).optional().nullable(),
    email: z.string().max(200).optional().nullable(),
    phone: z.string().max(50).optional().nullable(),
    position: z.string().max(100).optional().nullable(),
    internalNote: z.string().optional().nullable(),
    });

    // ── Clients ─────────────────────────────────────────────────────────────────

    export type ClientWithProjects = (ClientPublic | Client) & {
      projects: { id: string; code: string; name: string; icon: string; status: string }[];
    };

    export async function listClients(
    actor: User
    ): Promise<ClientWithProjects[]> {
    authorize(actor, "client:read");
    const rows = await db
      .select()
      .from(clientsTable)
      .where(isNull(clientsTable.archivedAt))
      .orderBy(clientsTable.name);

    if (rows.length === 0) return [];

    const clientIds = rows.map((c) => c.id);
    const linkedProjects = await db
      .select({
        id: projectsTable.id,
        code: projectsTable.code,
        name: projectsTable.name,
        icon: projectsTable.icon,
        status: projectsTable.status,
        clientId: projectsTable.clientId,
      })
      .from(projectsTable)
      .where(inArray(projectsTable.clientId, clientIds));

    const projectsByClient = new Map<string, typeof linkedProjects>();
    for (const p of linkedProjects) {
      if (!p.clientId) continue;
      if (!projectsByClient.has(p.clientId)) projectsByClient.set(p.clientId, []);
      projectsByClient.get(p.clientId)!.push(p);
    }

    return rows.map((c) => ({
      ...projectClient(actor, c),
      projects: (projectsByClient.get(c.id) ?? []).map((p) => ({
        id: p.id, code: p.code, name: p.name, icon: p.icon, status: p.status,
      })),
    }));
    }

    export async function getClientById(
    actor: User,
    id: string
    ): Promise<ClientPublic | Client | null> {
    authorize(actor, "client:read");
    const [client] = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.id, id))
      .limit(1);
    if (!client) return null;
    return projectClient(actor, client);
    }

    export async function createClient(
    actor: User,
    input: z.infer<typeof createClientSchema>
    ): Promise<Client> {
    authorize(actor, "client:update");
    const data = createClientSchema.parse(input);
    const [client] = await db
      .insert(clientsTable)
      .values({ ...data, internalNote: data.internalNote ?? null })
      .returning();
    return client;
    }

    export async function updateClient(
    actor: User,
    id: string,
    input: z.infer<typeof updateClientSchema>
    ): Promise<ClientPublic | Client | null> {
    authorize(actor, "client:update");
    const data = updateClientSchema.parse(input);
    const [updated] = await db
      .update(clientsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(clientsTable.id, id))
      .returning();
    if (!updated) return null;
    return projectClient(actor, updated);
    }

    export async function archiveClient(
    actor: User,
    id: string
    ): Promise<void> {
    authorize(actor, "client:archive");
    await db
      .update(clientsTable)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(clientsTable.id, id));
    }

    // ── Contacts ─────────────────────────────────────────────────────────────────

    export async function listContacts(
    actor: User,
    clientId: string
    ): Promise<(ContactPublic | Contact)[]> {
    authorize(actor, "client:read");
    const rows = await db
      .select()
      .from(contactsTable)
      .where(eq(contactsTable.clientId, clientId))
      .orderBy(contactsTable.firstName);
    return rows.map((c) => projectContact(actor, c));
    }

    export async function createContact(
    actor: User,
    clientId: string,
    input: z.infer<typeof createContactSchema>
    ): Promise<Contact> {
    authorize(actor, "client:update");
    const data = createContactSchema.parse(input);
    const [contact] = await db
      .insert(contactsTable)
      .values({ clientId, ...data, internalNote: data.internalNote ?? null })
      .returning();
    return contact;
    }

    export async function updateContact(
    actor: User,
    contactId: string,
    input: z.infer<typeof updateContactSchema>
    ): Promise<ContactPublic | Contact | null> {
    authorize(actor, "client:update");
    const data = updateContactSchema.parse(input);
    const [updated] = await db
      .update(contactsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(contactsTable.id, contactId))
      .returning();
    if (!updated) return null;
    return projectContact(actor, updated);
    }

    export async function archiveContact(
    actor: User,
    contactId: string
    ): Promise<void> {
    authorize(actor, "client:archive");
    await db
      .update(contactsTable)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(contactsTable.id, contactId));
    }
    