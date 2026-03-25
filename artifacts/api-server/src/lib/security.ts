import type { Request, Response, NextFunction } from "express";
import { appEnv } from "./env";

function buildAllowedOrigins() {
  return new Set(
    [
      ...appEnv.allowedAppOrigins,
      "https://aleryaf.store",
      "http://localhost:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:5174",
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
  );
}

const allowedOrigins = buildAllowedOrigins();

export function isAllowedOrigin(origin: string | undefined | null) {
  if (!origin) return false;
  return allowedOrigins.has(origin);
}

export function corsOriginValidator(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) {
  if (!origin) {
    callback(null, !appEnv.isProduction);
    return;
  }

  if (isAllowedOrigin(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error("Origin is not allowed by CORS"));
}

export function requireTrustedOrigin(req: Request, res: Response, next: NextFunction) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    next();
    return;
  }

  const origin = req.get("origin");
  const referer = req.get("referer");

  if (origin && isAllowedOrigin(origin)) {
    next();
    return;
  }

  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (isAllowedOrigin(refererOrigin)) {
        next();
        return;
      }
    } catch {
      // Ignore invalid referer and fail below.
    }
  }

  res.status(403).json({ error: "Untrusted request origin" });
}
