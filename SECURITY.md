# Security

## Secret Management

- Never commit `.env`, `.env.*`, private keys, database credentials, VAPID private keys, session secrets, invite tokens, or bootstrap passwords.
- Use platform-managed secrets in production only. For Railway, configure values in the service variables UI. For local development, use an untracked `.env.local` or `.env`.
- The backend now validates required environment variables at startup and fails fast in production when required secrets are missing.

## Secret Rotation

When secrets were exposed or you suspect compromise:

1. Rotate `DATABASE_URL` credentials in the database platform.
2. Rotate `SESSION_SECRET`.
   Changing this forces all CSRF token derivation and session signing assumptions to change. Also revoke all active sessions from the admin UI or directly in the database if needed.
3. Rotate `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.
   Existing browser push subscriptions will need to re-register.
4. Rotate `ADMIN_BOOTSTRAP_PASSWORD` and disable it after initial bootstrap.
5. Rotate `HANDBOOK_MASTER_PASSWORD` if it was ever shared outside authorized operators.
6. Review audit logs for:
   - login failures
   - invite creation and redemption
   - session revocations
   - admin actions
7. Invalidate all active sessions by deleting rows from `auth_sessions` or using the revoke sessions control.

## Local Development

- Copy `.env.example` to an untracked local env file.
- Do not reuse production secrets locally.
- Prefer ephemeral local credentials and disposable development databases.

## Hardening Checklist

See `SECURITY_CHECKLIST.md`.
