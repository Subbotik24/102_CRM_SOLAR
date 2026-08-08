import { once } from "node:events";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";

const TEST_PORT = process.env["PDS_INTEGRATION_PORT"] ?? "18080";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

export function createIntegrationEnvironment(
  baseEnvironment: NodeJS.ProcessEnv = process.env,
  port = baseEnvironment["PDS_INTEGRATION_PORT"] ?? TEST_PORT,
): NodeJS.ProcessEnv {
  return {
    ...baseEnvironment,
    NODE_ENV: "test",
    PORT: port,
    API_URL: `http://127.0.0.1:${port}/api`,
    TEST_ADMIN_EMAIL: baseEnvironment["TEST_ADMIN_EMAIL"] ?? baseEnvironment["SEED_ADMIN_EMAIL"],
    TEST_ADMIN_PASSWORD: baseEnvironment["TEST_ADMIN_PASSWORD"] ?? baseEnvironment["SEED_ADMIN_PASSWORD"],
  };
}

export async function waitForReady(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`Readiness returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 250));
  }

  throw new Error(
    `Integration API did not become ready at ${url}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

async function assertTestPortAvailable(port = TEST_PORT): Promise<void> {
  const server = createServer();
  try {
    server.listen(Number(port), "127.0.0.1");
    await once(server, "listening");
  } catch (error) {
    throw new Error(
      `Integration runner requires port ${port}; set PDS_INTEGRATION_PORT to an available loopback port instead.`,
      { cause: error }
    );
  } finally {
    if (server.listening) {
      await new Promise<void>((resolveClose, rejectClose) =>
        server.close((error) => (error ? rejectClose(error) : resolveClose()))
      );
    }
  }
}

async function runPnpm(args: string[], environment: NodeJS.ProcessEnv): Promise<void> {
  const child = spawn(pnpmCommand, args, {
    cwd: repoRoot,
    env: environment,
    stdio: "inherit",
  });
  const [exitCode] = (await once(child, "exit")) as [number | null];
  if (exitCode !== 0) {
    throw new Error(`pnpm ${args.join(" ")} exited with code ${exitCode ?? "signal"}`);
  }
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.killed) return;
  child.kill("SIGTERM");
  const exited = Promise.race([
    once(child, "exit"),
    new Promise((resolveTimer) => setTimeout(resolveTimer, 5_000)),
  ]);
  await exited;
  if (child.exitCode === null && !child.killed) child.kill("SIGKILL");
}

async function main(): Promise<void> {
  const envFile = resolve(repoRoot, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const environment = createIntegrationEnvironment();

  await assertTestPortAvailable(environment.PORT);
  await runPnpm(["--filter", "@workspace/api-server", "run", "build"], environment);

  const api = spawn(pnpmCommand, ["--filter", "@workspace/api-server", "run", "start"], {
    cwd: repoRoot,
    env: environment,
    stdio: "inherit",
  });

  try {
    await waitForReady(`${environment.API_URL}/readyz`);
    await runPnpm(
      ["--filter", "@workspace/tests", "run", "test:integration:against-running"],
      environment
    );
  } finally {
    await stopChild(api);
  }
}

const invokedAsScript = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (invokedAsScript) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
