import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEV_DOMAIN = process.env.REPLIT_DEV_DOMAIN;
const BASE_URL = DEV_DOMAIN
  ? `https://${DEV_DOMAIN}`
  : "http://localhost:5173";

const chromiumExec = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(repoRoot, ".env");

// Playwright executes test modules before the API package has a chance to load
// its environment bootstrap. Keep browser tests aligned with the integration
// runner while preserving CI-provided variables as the higher-priority source.
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 90_000,
  reporter: [["list"]],
  webServer: [
    {
      command: "pnpm --filter @workspace/api-server run dev",
      cwd: repoRoot,
      url: "http://127.0.0.1:8080/api/healthz",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @workspace/pds-app run dev",
      cwd: repoRoot,
      env: { ...process.env, PORT: "5173" },
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
  use: {
    baseURL: BASE_URL,
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        launchOptions: {
          ...(chromiumExec ? { executablePath: chromiumExec } : {}),
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        },
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
});
