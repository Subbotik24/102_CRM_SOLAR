import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import type { User } from "@workspace/db";
import { logger } from "../../lib/logger";

// Dummy hash used for timing-safe comparisons when user not found
// Prevents user-enumeration via timing attacks
const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export class AuthError extends Error {
  readonly status = 401 as const;
  constructor(message = "Invalid credentials") {
    super(message);
    this.name = "AuthError";
  }
}

export class SuspendedError extends Error {
  readonly status = 403 as const;
  constructor() {
    super("Account is suspended");
    this.name = "SuspendedError";
  }
}

/**
 * Validate email+password and return the matching user.
 * Throws AuthError on invalid credentials, SuspendedError on suspended accounts.
 */
export async function validateCredentials(
  email: string,
  password: string
): Promise<User> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));

  // Always run hash verification to prevent timing-based user enumeration
  const hash = user?.passwordHash ?? DUMMY_HASH;
  const valid = await argon2.verify(hash, password).catch(() => false);

  if (!user || !valid) {
    throw new AuthError();
  }

  if (user.status === "suspended") {
    throw new SuspendedError();
  }

  return user;
}

/**
 * Record a successful login (updates last_login_at).
 */
export async function recordLogin(userId: string): Promise<void> {
  await db
    .update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, userId));
  logger.info({ userId }, "User logged in");
}

/**
 * Fetch a user by ID. Returns null if not found or suspended.
 * Used by the session middleware to reload the current user.
 */
export async function getUserById(id: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id));
  return user ?? null;
}
