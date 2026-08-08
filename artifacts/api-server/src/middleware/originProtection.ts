import type { RequestHandler } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function normalizeOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

export function isAllowedBrowserOrigin(
  origin: string,
  requestOrigin: string,
  configuredOrigins: ReadonlySet<string>
): boolean {
  const normalizedOrigin = normalizeOrigin(origin);
  const normalizedRequestOrigin = normalizeOrigin(requestOrigin);
  if (!normalizedOrigin || !normalizedRequestOrigin) return false;
  return (
    normalizedOrigin === normalizedRequestOrigin ||
    configuredOrigins.has(normalizedOrigin)
  );
}

export function protectUnsafeBrowserRequests(
  configuredOrigins: ReadonlySet<string>
): RequestHandler {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const origin = req.get("origin");
    // Non-browser clients and repository integration tests do not send Origin.
    if (!origin) {
      next();
      return;
    }

    const requestOrigin = `${req.protocol}://${req.get("host") ?? ""}`;
    if (isAllowedBrowserOrigin(origin, requestOrigin, configuredOrigins)) {
      next();
      return;
    }

    res.status(403).json({ error: "Untrusted request origin" });
  };
}

export function normalizedOriginSet(values: readonly string[]): Set<string> {
  return new Set(
    values
      .map(normalizeOrigin)
      .filter((value): value is string => value !== undefined)
  );
}
