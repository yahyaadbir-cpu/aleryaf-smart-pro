import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { appEnv } from "./env";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

function csrfCookieOptions() {
  return {
    httpOnly: false,
    sameSite: "strict" as const,
    secure: appEnv.isProduction,
    path: "/",
  };
}

export function ensureCsrfCookie(req: Request, res: Response, next: NextFunction) {
  const existing = typeof req.cookies?.[appEnv.CSRF_COOKIE_NAME] === "string" ? req.cookies[appEnv.CSRF_COOKIE_NAME] : null;
  if (!existing) {
    res.cookie(appEnv.CSRF_COOKIE_NAME, createToken(), csrfCookieOptions());
  }
  next();
}

export function clearCsrfCookie(res: Response) {
  res.clearCookie(appEnv.CSRF_COOKIE_NAME, csrfCookieOptions());
}

export function rotateCsrfCookie(res: Response) {
  const token = createToken();
  res.cookie(appEnv.CSRF_COOKIE_NAME, token, csrfCookieOptions());
  return token;
}

export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const cookieToken = typeof req.cookies?.[appEnv.CSRF_COOKIE_NAME] === "string" ? req.cookies[appEnv.CSRF_COOKIE_NAME] : "";
  const headerToken = typeof req.get("x-csrf-token") === "string" ? req.get("x-csrf-token") ?? "" : "";

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({ error: "CSRF validation failed" });
    return;
  }

  next();
}
