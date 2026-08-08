/**
 * Creates a test member account for manual QA.
 * Usage: pnpm --filter @workspace/api-server run seed:test-member
 */
import "../lib/env";
import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { logger } from "../lib/logger";

const EMAIL = "member@company.com";
const PASSWORD = "Member12345";
const DISPLAY_NAME = "Тест Учасник";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("seed:test-member is test-only and cannot run in production");
  }
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, EMAIL));

  if (existing) {
    logger.info({ email: EMAIL }, "Test member already exists — skipping");
    process.exit(0);
  }

  const passwordHash = await argon2.hash(PASSWORD);
  const [user] = await db
    .insert(usersTable)
    .values({
      email: EMAIL,
      passwordHash,
      displayName: DISPLAY_NAME,
      role: "member",
      locale: "uk",
      timezone: "Europe/Kyiv",
      status: "active",
    })
    .returning({ id: usersTable.id, email: usersTable.email });

  logger.info({ id: user.id, email: user.email }, "Test member created — password set (not logged)");
  process.exit(0);
}

main().catch((err) => { logger.error(err); process.exit(1); });
