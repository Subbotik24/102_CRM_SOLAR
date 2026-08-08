import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { handleError } from "./handleError";
import {
  listLibraryItems,
  createLibraryItem,
  updateLibraryItem,
  deleteLibraryItem,
  createLibraryItemSchema,
  updateLibraryItemSchema,
} from "../services/library";

const router = Router();

router.get("/library", requireAuth, async (req, res): Promise<void> => {
  try {
    const category =
      typeof req.query.category === "string" ? req.query.category as string : undefined;
    const items = await listLibraryItems(req.user!, category);
    res.json({ items });
  } catch (err) {
    handleError(err, res);
  }
});

router.post("/library", requireAuth, async (req, res): Promise<void> => {
  const parsed = createLibraryItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", issues: parsed.error.issues });
    return;
  }
  try {
    const item = await createLibraryItem(req.user!, parsed.data);
    res.status(201).json(item);
  } catch (err) {
    handleError(err, res);
  }
});

router.patch("/library/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = updateLibraryItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  try {
    const item = await updateLibraryItem(req.user!, req.params.id as string, parsed.data);
    if (!item) { res.status(404).json({ error: "Item not found" }); return; }
    res.json(item);
  } catch (err) {
    handleError(err, res);
  }
});

router.delete("/library/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    await deleteLibraryItem(req.user!, req.params.id as string);
    res.status(204).send();
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
