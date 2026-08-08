/** Credentials are supplied by local/CI test tooling, never committed. */
export const TEST_ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? process.env.SEED_ADMIN_EMAIL;
export const TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD;

export function requireTestAdminCredentials(): { email: string; password: string } {
  if (!TEST_ADMIN_EMAIL || !TEST_ADMIN_PASSWORD) {
    throw new Error("Integration tests require TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD (or matching SEED_ADMIN_* variables)");
  }
  return { email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD };
}
