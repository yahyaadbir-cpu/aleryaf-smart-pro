import pino from "pino";
import { appEnv } from "./env";

const isProduction = appEnv.isProduction;

export const logger = pino({
  level: appEnv.LOG_LEVEL,
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "req.headers['x-csrf-token']",
    "res.headers['set-cookie']",
    "password",
    "*.password",
    "*.passwordHash",
    "*.token",
    "*.credential",
    "*.idToken",
    "*.sessionToken",
    "*.csrfToken",
    "*.authorization",
    "*.cookie",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
