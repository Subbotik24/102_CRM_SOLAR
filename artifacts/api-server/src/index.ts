import app from "./app";
import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { startTransferJob } from "./jobs/transferFiles";

// PORT is validated and defaulted by the env schema (3000 unless overridden).
const port = env.PORT;

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Start background file transfer job (App Storage → Dropbox)
  startTransferJob();
});
