/**
 * Seed script — creates the initial admin user.
 *
 * Idempotent: if the admin email already exists, it skips insertion.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server run db:seed
 *
 * Required env:
 *   SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD=<12+ character password> pnpm ...
 */
import "../lib/env"; // validate env first
import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { logger } from "../lib/logger";

const SEED_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@crm-solar.local";
const SEED_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
const SEED_DISPLAY_NAME = process.env.SEED_ADMIN_NAME ?? "System Admin";

async function seed() {
  if (!SEED_PASSWORD || SEED_PASSWORD.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must be explicitly set and contain at least 12 characters");
  }
  logger.info({ email: SEED_EMAIL }, "Starting seed");

  // Enable citext extension (idempotent)
  try {
    const { pool } = await import("@workspace/db");
    await pool.query("CREATE EXTENSION IF NOT EXISTS citext");
    logger.info("citext extension ensured");
  } catch (err) {
    logger.warn({ err }, "Could not create citext extension — may need superuser privileges");
  }

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, SEED_EMAIL));

  if (existing) {
    logger.info({ email: SEED_EMAIL }, "Admin user already exists — skipping");
    return;
  }

  const passwordHash = await argon2.hash(SEED_PASSWORD);

  const [user] = await db
    .insert(usersTable)
    .values({
      email: SEED_EMAIL,
      passwordHash,
      displayName: SEED_DISPLAY_NAME,
      role: "admin",
      locale: "uk",
      timezone: "Europe/Kyiv",
      status: "active",
    })
    .returning({ id: usersTable.id, email: usersTable.email });

  logger.info({ id: user.id }, "Admin user created — change the password immediately after first login");
}

seed()
  .then(() => {
    logger.info("Seed complete");
    process.exit(0);
  })
  .catch((err) => {
    logger.error({ err }, "Seed failed");
    process.exit(1);
  });
