import app from "./app";
import { logger } from "./lib/logger";
import { appEnv } from "./lib/env";

const host = "0.0.0.0";
const port = appEnv.PORT;

app.listen(port, host, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ host, port }, "Server listening");
});
