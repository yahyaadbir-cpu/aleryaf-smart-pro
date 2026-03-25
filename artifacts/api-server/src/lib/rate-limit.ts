import type { Request, Response, NextFunction } from "express";
import { writeSecurityAuditEvent } from "./audit";

type RateLimitRecord = {
  count: number;
  firstSeenAt: number;
  blockedUntil: number;
};

type RateLimitOptions = {
  windowMs: number;
  maxRequests: number;
  blockDurationMs?: number;
  keyPrefix: string;
  eventType: string;
  message: string;
  includeUsername?: boolean;
  onBlocked?: typeof writeSecurityAuditEvent;
};

const buckets = new Map<string, RateLimitRecord>();

function getClientKey(req: Request, includeUsername = false) {
  const base = req.ip || "unknown";
  if (!includeUsername) return base;
  const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
  return `${base}:${username}`;
}

export function createRateLimitMiddleware(options: RateLimitOptions) {
  return async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const now = Date.now();
    const key = `${options.keyPrefix}:${getClientKey(req, options.includeUsername)}`;
    const current = buckets.get(key);

    if (!current || now - current.firstSeenAt > options.windowMs) {
      buckets.set(key, {
        count: 1,
        firstSeenAt: now,
        blockedUntil: 0,
      });
      next();
      return;
    }

    const audit = options.onBlocked ?? writeSecurityAuditEvent;

    if (current.blockedUntil > now) {
      const retryAfterSeconds = Math.ceil((current.blockedUntil - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      await audit({
        req,
        eventType: options.eventType,
        outcome: "blocked",
        actorUserId: req.authUser?.id ?? null,
        actorUsername: req.authUser?.username ?? null,
        metadata: {
          retryAfterSeconds,
          reason: "rate-limit",
        },
      });
      res.status(429).json({ error: options.message });
      return;
    }

    current.count += 1;
    if (current.count > options.maxRequests) {
      current.blockedUntil = now + (options.blockDurationMs ?? options.windowMs);
      buckets.set(key, current);
      const retryAfterSeconds = Math.ceil((current.blockedUntil - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      await audit({
        req,
        eventType: options.eventType,
        outcome: "blocked",
        actorUserId: req.authUser?.id ?? null,
        actorUsername: req.authUser?.username ?? null,
        metadata: {
          retryAfterSeconds,
          reason: "rate-limit-threshold",
        },
      });
      res.status(429).json({ error: options.message });
      return;
    }

    buckets.set(key, current);
    next();
  };
}
