import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? process.env.SEED_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD;

async function loginThroughUi(page: import("@playwright/test").Page) {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error("TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD or SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD are required");
  await page.goto("/login");
  await page.locator('[data-testid="input-email"]').fill(ADMIN_EMAIL);
  await page.locator('[data-testid="input-password"]').fill(ADMIN_PASSWORD);
  await page.locator('[data-testid="button-submit-login"]').click();
  await expect(page.locator('[data-testid="delivery-dashboard"]')).toBeVisible({
    timeout: 20_000,
  });
}

test("Engineering Pro shell and dashboard work across desktop, admin, theme, and logout", async ({
  page,
}) => {
  await loginThroughUi(page);

  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await expect(page.locator('[data-testid="nav-desktop-projects"]')).toBeVisible();

  const productRoutes = [
    "/projects",
    "/tasks",
    "/kanban",
    "/calendar",
    "/clients",
    "/members",
    "/library",
    "/chat",
    "/settings",
    "/admin/users",
    "/admin/audit-log",
    "/admin/dropbox",
    "/admin/settings",
    "/more",
  ];

  async function assertRouteLayout(path: string) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
  }

  for (const path of productRoutes) {
    await assertRouteLayout(path);
  }

  await page.goto("/");
  const themeButton = page.locator('[data-testid="btn-toggle-theme"]');
  await themeButton.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("pds.theme")))
    .toBe("dark");

  for (const path of productRoutes) {
    await assertRouteLayout(path);
    await expect(page.locator("html")).toHaveClass(/dark/);
  }

  await page.goto("/");
  const logoutResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/logout") &&
      response.request().method() === "POST"
  );
  await page.locator('[data-testid="btn-logout-sidebar"]').click();
  const logoutResponse = await logoutResponsePromise;
  expect(logoutResponse.status()).toBe(204);
  await expect(page.locator('[data-testid="button-submit-login"]')).toBeVisible({
    timeout: 10_000,
  });
  expect(consoleErrors).toEqual([]);
});

test("mobile navigation remains usable at 375px without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await loginThroughUi(page);

  await expect(page.locator('[data-testid="nav-mobile-home"]')).toBeVisible();
  await expect(page.locator('[data-testid="nav-mobile-more"]')).toBeVisible();
  await page.locator('[data-testid="nav-mobile-projects"]').click();
  await expect(page.locator("h1").first()).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await page.locator('[data-testid="btn-toggle-theme-mobile"]').click();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("password reset links open a public form and validate matching passwords", async ({
  page,
}) => {
  await page.goto("/reset-password?token=test-token");

  const form = page.locator('[data-testid="reset-password-form"]');
  await expect(form).toBeVisible();

  await page.locator('[data-testid="input-new-password"]').fill("NewPassword123!");
  await page.locator('[data-testid="input-confirm-password"]').fill("DifferentPassword123!");
  await page.locator('[data-testid="button-reset-password"]').click();

  await expect(page.locator('[data-testid="reset-password-error"]')).toBeVisible();

  const resetResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/reset-password") &&
      response.request().method() === "POST"
  );
  await page.locator('[data-testid="input-confirm-password"]').fill("NewPassword123!");
  await page.locator('[data-testid="button-reset-password"]').click();

  expect((await resetResponse).status()).toBe(400);
  await expect(page.locator('[data-testid="reset-password-error"]')).toBeVisible();
});
