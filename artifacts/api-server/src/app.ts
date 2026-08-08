import "./lib/env"; // Validates all env vars at startup — fails fast with clear errors
import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import { env } from "./lib/env";
import router from "./routes";
import { logger } from "./lib/logger";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import {
  normalizedOriginSet,
  protectUnsafeBrowserRequests,
} from "./middleware/originProtection";

// Origins allowed to send credentialed cross-origin requests. In the Replit
// deployment the frontend and the API share one origin, so the list is empty
// and CORS simply never applies.
const corsOrigins = env.CORS_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const browserOrigins = normalizedOriginSet([
  ...corsOrigins,
  ...(env.APP_URL ? [env.APP_URL] : []),
]);

const PgStore = connectPgSimple(session);

const app: Express = express();

// Trust the reverse proxy (Replit's proxy layer) so rate limiters see real IPs
app.set("trust proxy", 1);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // required for Tailwind inline styles
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: env.NODE_ENV === "production" ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false, // Replit preview requires relaxed COEP
  })
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  })
);

// `origin: true` would reflect *any* Origin back with credentials enabled.
// Restrict to the configured allowlist instead; same-origin requests carry no
// Origin restriction and are unaffected.
app.use(
  cors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true, // Required for session cookies
  })
);

app.use(protectUnsafeBrowserRequests(browserOrigins));
app.use(express.json({ limit: "256kb" }));
app.use(
  express.urlencoded({
    extended: true,
    limit: "64kb",
    parameterLimit: 1000,
  })
);

// PostgreSQL-backed sessions
app.use(
  session({
    store: new PgStore({
      pool,
      createTableIfMissing: true, // connect-pg-simple creates the sessions table
      tableName: "sessions",
    }),
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: "pds.sid",
    cookie: {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  })
);

app.use("/api", router);
app.use("/api", notFoundHandler);
app.use(errorHandler);

export default app;
