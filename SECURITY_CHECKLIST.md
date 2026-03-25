# Security Hardening Checklist

- [ ] Store production secrets only in the deployment platform secret manager
- [ ] Confirm `.env` and `.env.*` are not tracked by Git
- [ ] Run `pnpm db:push` after schema changes
- [ ] Verify admin-only routes return `403` for non-admin users
- [ ] Verify CSRF header is required for authenticated mutations
- [ ] Verify login and invite redemption rate limits work
- [ ] Verify password change revokes old sessions immediately
- [ ] Verify role or permission change revokes old sessions immediately
- [ ] Verify disabled users lose access immediately
- [ ] Verify handbook endpoint returns safe metadata only
- [ ] Verify invite tokens expire and cannot be reused
- [ ] Verify Google sign-in, if enabled, is restricted to explicit allowlisted email addresses
- [ ] Verify logs do not contain cookies, passwords, tokens, or secret env values
