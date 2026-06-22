# Security Operations

## Required production configuration

- Set a long random `JWT_SECRET`; startup rejects the development fallback. For a single-host PM2 deployment, `npm --prefix server run security:init` creates an ignored, permission-restricted persistent runtime secret when an environment secret is not supplied.
- Set `CIMS_LOGIN_URL` to the canonical HTTPS login URL.
- Restrict `ALLOWED_ORIGINS` to trusted HTTPS origins.
- Keep Brevo, SMS, database, and AI credentials outside Git.
- Terminate TLS at the reverse proxy and redirect HTTP to HTTPS.

## Controls

The API reloads the authenticated user from MySQL, rejects disabled users and stale session versions, applies secure response headers, and rate-limits sensitive endpoints to 20 requests per five minutes. Privileged routes enforce server-side authorization. Passwords use bcrypt; successful login can upgrade a legacy password hash during migration.

Uploads accept only configured business document/image types, use generated storage names, enforce size limits, and are downloaded through an authenticated route. Public feedback submissions require a valid, unexpired, single-use token bound to the client and installation.

## Incident response

Disable the affected account, increment its session version, rotate exposed secrets, preserve audit/security logs, and restore only from a verified backup. Review notification-provider logs for unintended delivery and invalidate outstanding password-reset and feedback tokens.

## Security review artifact

The repository audit records the threat model, validation evidence, reviewed surfaces, and remediation status. Re-run authentication, authorization, upload, feedback, and backup tests after changes to these boundaries.
