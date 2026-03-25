import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { appEnv } from "./env";
import { hashPasswordForStorage, normalizeUsername, type AuthenticatedUser } from "./auth";

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

function parseEmailList(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

export const googleAllowedEmails = parseEmailList(appEnv.GOOGLE_ALLOWED_EMAILS);
export const googleAdminEmails = parseEmailList(appEnv.GOOGLE_ADMIN_EMAILS);
const googleAccessibleEmails = new Set([...googleAllowedEmails, ...googleAdminEmails]);

export function isGoogleAuthEnabled() {
  return Boolean(appEnv.GOOGLE_CLIENT_ID && googleAccessibleEmails.size > 0);
}

export function resolveGoogleEmailAccess(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return {
    email: normalizedEmail,
    allowed: googleAccessibleEmails.has(normalizedEmail),
    isAdmin: googleAdminEmails.has(normalizedEmail),
  };
}

export async function verifyGoogleIdToken(idToken: string) {
  if (!appEnv.GOOGLE_CLIENT_ID) {
    throw new Error("Google sign-in is not configured");
  }

  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: GOOGLE_ISSUERS,
    audience: appEnv.GOOGLE_CLIENT_ID,
  });

  const email = typeof payload.email === "string" ? payload.email : "";
  const emailVerified = payload.email_verified === true;

  if (!email || !emailVerified) {
    throw new Error("Google account email is not verified");
  }

  return {
    email: email.toLowerCase(),
    emailVerified,
    subject: typeof payload.sub === "string" ? payload.sub : "",
    name: typeof payload.name === "string" ? payload.name : "",
  };
}

export async function authenticateWithGoogleIdToken(idToken: string) {
  if (!isGoogleAuthEnabled()) {
    return { ok: false as const, error: "Google sign-in is not configured" };
  }

  const googleUser = await verifyGoogleIdToken(idToken);
  const access = resolveGoogleEmailAccess(googleUser.email);

  if (!access.allowed) {
    return { ok: false as const, error: "This Google account is not allowed" };
  }

  const username = normalizeUsername(access.email);
  const [existingUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username))
    .limit(1);

  if (existingUser) {
    if (!existingUser.isActive) {
      return { ok: false as const, error: "This account is disabled" };
    }

    return {
      ok: true as const,
      user: {
        id: existingUser.id,
        username: existingUser.username,
        isAdmin: existingUser.isAdmin === 1,
        canUseTurkishInvoices: existingUser.canUseTurkishInvoices === 1,
        sessionVersion: existingUser.sessionVersion,
      } satisfies AuthenticatedUser,
      created: false,
    };
  }

  const now = new Date();
  const [createdUser] = await db
    .insert(usersTable)
    .values({
      username,
      passwordHash: hashPasswordForStorage(crypto.randomBytes(32).toString("hex")),
      isAdmin: access.isAdmin ? 1 : 0,
      isActive: 1,
      sessionVersion: 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return {
    ok: true as const,
    user: {
      id: createdUser.id,
      username: createdUser.username,
      isAdmin: createdUser.isAdmin === 1,
      canUseTurkishInvoices: createdUser.canUseTurkishInvoices === 1,
      sessionVersion: createdUser.sessionVersion,
    } satisfies AuthenticatedUser,
    created: true,
  };
}
