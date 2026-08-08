import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { authorize } from "../services/access";
import { handleError } from "./handleError";
import {
  listClients,
  getClientById,
  createClient,
  updateClient,
  archiveClient,
  listContacts,
  createContact,
  updateContact,
  archiveContact,
  createClientSchema,
  updateClientSchema,
  createContactSchema,
  updateContactSchema,
} from "../services/clients";

const router = Router();

router.get("/clients", requireAuth, async (req, res): Promise<void> => {
  try {
    authorize(req.user!, "client:read");
    const clients = await listClients(req.user!);
    res.json({ clients });
  } catch (err) { handleError(err, res); }
});

router.post("/clients", requireAuth, async (req, res): Promise<void> => {
  const parsed = createClientSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  try {
    authorize(req.user!, "client:update");
    const client = await createClient(req.user!, parsed.data);
    res.status(201).json(client);
  } catch (err) { handleError(err, res); }
});

router.get("/clients/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    authorize(req.user!, "client:read");
    const client = await getClientById(req.user!, req.params.id as string);
    if (!client) { res.status(404).json({ error: "Client not found" }); return; }
    res.json(client);
  } catch (err) { handleError(err, res); }
});

router.patch("/clients/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = updateClientSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  try {
    authorize(req.user!, "client:update");
    const client = await updateClient(req.user!, req.params.id as string, parsed.data);
    if (!client) { res.status(404).json({ error: "Client not found" }); return; }
    res.json(client);
  } catch (err) { handleError(err, res); }
});

router.post("/clients/:id/archive", requireAuth, async (req, res): Promise<void> => {
  try {
    authorize(req.user!, "client:archive");
    await archiveClient(req.user!, req.params.id as string);
    res.status(204).send();
  } catch (err) { handleError(err, res); }
});

router.get("/clients/:id/contacts", requireAuth, async (req, res): Promise<void> => {
  try {
    authorize(req.user!, "client:read");
    const contacts = await listContacts(req.user!, req.params.id as string);
    res.json({ contacts });
  } catch (err) { handleError(err, res); }
});

router.post("/clients/:id/contacts", requireAuth, async (req, res): Promise<void> => {
  const parsed = createContactSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  try {
    authorize(req.user!, "client:update");
    const contact = await createContact(req.user!, req.params.id as string, parsed.data);
    res.status(201).json(contact);
  } catch (err) { handleError(err, res); }
});

router.patch("/contacts/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = updateContactSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  try {
    authorize(req.user!, "client:update");
    const contact = await updateContact(req.user!, req.params.id as string, parsed.data);
    if (!contact) { res.status(404).json({ error: "Contact not found" }); return; }
    res.json(contact);
  } catch (err) { handleError(err, res); }
});

router.delete("/contacts/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    authorize(req.user!, "client:archive");
    await archiveContact(req.user!, req.params.id as string);
    res.status(204).send();
  } catch (err) { handleError(err, res); }
});

export default router;
