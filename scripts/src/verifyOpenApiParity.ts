/**
 * Fails when an Express route and the published OpenAPI contract drift apart.
 * The parser intentionally handles the repository's narrow, literal route
 * style rather than adding a YAML parsing dependency to the scripts package.
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const routeDir = join(root, "artifacts/api-server/src/routes");
const specPath = join(root, "lib/api-spec/openapi.yaml");
type Method = "get" | "post" | "put" | "patch" | "delete";

function key(method: Method, path: string) {
  return `${method.toUpperCase()} ${path}`;
}

function toOpenApiPath(routePath: string) {
  return routePath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

async function collectExpressOperations(): Promise<Set<string>> {
  const files = (await readdir(routeDir)).filter((file) => file.endsWith(".ts") && !["index.ts", "handleError.ts"].includes(file));
  const operations = new Set<string>();
  const pattern = /router\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g;
  for (const file of files) {
    const source = await readFile(join(routeDir, file), "utf8");
    for (const match of source.matchAll(pattern)) {
      operations.add(key(match[1] as Method, toOpenApiPath(match[2])));
    }
  }
  return operations;
}

async function collectOpenApiOperations(): Promise<Set<string>> {
  const lines = (await readFile(specPath, "utf8")).split(/\r?\n/);
  const operations = new Set<string>();
  let path: string | null = null;
  let inPaths = false;
  for (const line of lines) {
    if (line === "paths:") { inPaths = true; continue; }
    if (inPaths && /^[A-Za-z][A-Za-z0-9_]*:$/.test(line)) break;
    const pathMatch = line.match(/^ {2}(\/[^:]+):$/);
    if (pathMatch) { path = pathMatch[1]; continue; }
    const methodMatch = line.match(/^ {4}(get|post|put|patch|delete):$/);
    if (methodMatch && path !== null) operations.add(key(methodMatch[1] as Method, path));
  }
  return operations;
}

const [expressOperations, openApiOperations] = await Promise.all([
  collectExpressOperations(),
  collectOpenApiOperations(),
]);
const undocumented = [...expressOperations].filter((operation) => !openApiOperations.has(operation)).sort();
const stale = [...openApiOperations].filter((operation) => !expressOperations.has(operation)).sort();

if (undocumented.length || stale.length) {
  if (undocumented.length) console.error(`OpenAPI is missing ${undocumented.length} implemented operation(s):\n${undocumented.join("\n")}`);
  if (stale.length) console.error(`OpenAPI contains ${stale.length} stale operation(s):\n${stale.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`OpenAPI parity passed for ${expressOperations.size} operations.`);
}
