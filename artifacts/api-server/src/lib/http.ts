import type { Request, Response } from "express";
import { appEnv } from "./env";

type ErrorWithIssues = {
  issues?: Array<{
    path?: Array<string | number>;
    message?: string;
    code?: string;
  }>;
};

type ErrorWithCode = {
  code?: string;
  detail?: string;
  constraint?: string;
  column?: string;
};

export function toIsoDateTime(
  value: Date | string | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  return null;
}

export function requireMutationRow<T>(
  row: T | undefined,
  entityName: string,
): T {
  if (!row) {
    throw new Error(`${entityName} write did not return a row`);
  }

  return row;
}

function isZodLikeError(error: unknown): error is ErrorWithIssues {
  return Boolean(
    error &&
      typeof error === "object" &&
      "issues" in error &&
      Array.isArray((error as ErrorWithIssues).issues),
  );
}

function isDbError(error: unknown): error is ErrorWithCode {
  return Boolean(error && typeof error === "object" && "code" in error);
}

export function sendRouteError(
  req: Request,
  res: Response,
  error: unknown,
  options?: {
    fallbackStatus?: number;
    fallbackMessage?: string;
  },
) {
  const fallbackStatus = options?.fallbackStatus ?? 500;
  const fallbackMessage = options?.fallbackMessage ?? "Internal server error";

  if (isZodLikeError(error)) {
    req.log.warn({ err: error }, "Request validation failed");
    res.status(400).json({
      error: "Validation failed",
      details: error.issues?.map((issue) => ({
        path: issue.path?.join(".") ?? "",
        message: issue.message ?? "Invalid value",
        code: issue.code ?? "invalid",
      })),
    });
    return;
  }

  if (isDbError(error)) {
    const status =
      error.code === "23505"
        ? 409
        : error.code === "23502" || error.code === "23503" || error.code === "22P02"
          ? 400
          : fallbackStatus;
    const message =
      error.code === "23505"
        ? "Duplicate value violates a unique constraint"
        : error.code === "23502"
          ? "Missing required value"
          : error.code === "23503"
            ? "Referenced record does not exist"
            : error.code === "22P02"
              ? "Invalid value format"
              : fallbackMessage;

    req.log.error({ err: error }, "Database request failed");
    res.status(status).json(
      appEnv.isProduction
        ? { error: message }
        : {
            error: message,
            details: {
              code: error.code,
              detail: error.detail,
              constraint: error.constraint,
              column: error.column,
            },
          },
    );
    return;
  }

  req.log.error({ err: error }, "Unhandled route error");
  res.status(fallbackStatus).json({ error: fallbackMessage });
}
