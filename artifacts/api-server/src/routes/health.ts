import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { checkReadiness } from "../services/health";

const router: IRouter = Router();

router.get("/healthz", async (_req, res): Promise<void> => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

router.get("/readyz", async (_req, res): Promise<void> => {
  const databaseReady = await checkReadiness(
    () => pool.query("SELECT 1"),
    1_000
  );
  res.status(databaseReady ? 200 : 503).json({
    status: databaseReady ? "ready" : "not_ready",
    checks: { database: databaseReady ? "ok" : "unavailable" },
    timestamp: new Date().toISOString(),
  });
});

export default router;
