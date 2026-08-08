/**
 * Chronicle export route:
 *   GET /projects/:id/chronicle?format=md|pdf&locale=en
 */
import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { handleError } from "./handleError";
import { generateChronicle } from "../services/chronicle";

const router = Router();

router.get("/projects/:id/chronicle", requireAuth, async (req, res) => {
  try {
    const format = req.query.format === "pdf" ? "pdf" : "md";
    const { content, mimeType, filename } = await generateChronicle(
      req.user!,
      String(req.params.id),
      format
    );
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", content.length);
    res.send(content);
  } catch (e) {
    handleError(e, res);
  }
});

export default router;
