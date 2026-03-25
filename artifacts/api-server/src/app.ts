import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { corsOriginValidator, requireTrustedOrigin } from "./lib/security";
import { appEnv } from "./lib/env";
import { ensureCsrfCookie, requireCsrf } from "./lib/csrf";

const app: Express = express();
const isProduction = appEnv.isProduction;
const appDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDistDir = path.resolve(appDir, "..", "..", "aleryaf-hub", "dist", "public");
const frontendIndexPath = path.join(frontendDistDir, "index.html");
const hasFrontendBuild = fs.existsSync(frontendIndexPath);

app.disable("x-powered-by");
app.set("trust proxy", appEnv.TRUST_PROXY_HOPS);
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
  }),
);
const cspConnectSrc = ["'self'", ...appEnv.allowedAppOrigins.filter((value): value is string => Boolean(value))];

app.use(
  helmet({
    contentSecurityPolicy: isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: cspConnectSrc,
            fontSrc: ["'self'", "data:"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            frameAncestors: ["'none'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: [],
          },
        }
      : false,
    crossOriginEmbedderPolicy: false,
    hsts: isProduction,
  }),
);
app.use(
  cors({
    origin: corsOriginValidator,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Requested-With", "X-CSRF-Token"],
  }),
);
app.use(cookieParser());
app.use(ensureCsrfCookie);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((_, res, next) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});
app.use("/api", requireTrustedOrigin);
app.use("/api", requireCsrf);

app.use("/api", router);

if (isProduction && hasFrontendBuild) {
  app.use(express.static(frontendDistDir, { index: false }));

  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(frontendIndexPath);
  });
} else if (isProduction) {
  logger.warn({ frontendDistDir }, "Frontend build not found; backend will only serve API routes");
}

export default app;
