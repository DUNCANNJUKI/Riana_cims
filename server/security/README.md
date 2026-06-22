# API security foundation

Production requires a unique `JWT_SECRET` of at least 32 characters and an absolute `CIMS_LOGIN_URL`. Configure `CORS_ALLOWED_ORIGINS` (or legacy `ALLOWED_ORIGINS`) as a comma-separated list when RIANA is served from additional trusted origins.

Passwords are written with bcrypt. Existing plaintext rows are accepted once and upgraded atomically after the next successful login. `session_version` invalidates all outstanding tokens after password, role, or active-state changes.

All `/api` routes require a current active database user unless explicitly listed as public in `apiSecurity.js`. Feedback submission uses an HttpOnly, same-site token cookie and a database transaction. Uploaded files are authenticated, size-limited, signature-checked, generated-name objects; HTML and SVG are rejected.

Privileged backup schedule/manual-backup actions are Admin-only and append immutable application audit rows to `security_audit_events`. The application exposes no update or delete route for this table.
