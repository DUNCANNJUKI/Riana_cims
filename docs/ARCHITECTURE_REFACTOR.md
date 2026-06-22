# Unified CIMS + CRMS Architecture

## Target architecture

RIANA runs as one web application and one API. CIMS owns the application shell, authentication context, header, sidebar, footer, notifications, theme, and inactivity policy. CRMS is a native route group rendered inside that shell; it is not embedded in an iframe and does not create a second login or browser session.

The API uses one MySQL connection pool and one `user_profiles` identity. Module access is represented by modules, roles, permissions, and user-module-role mappings while the legacy `user_profiles.role` remains available during migration.

SuperAdmin is the top-level authority. User lifecycle and role grants are centralized in the main CIMS Users module. CRMS/Developers receives profile and module-role data for workflow decisions, but CRMS profile and role mutation endpoints are intentionally read-only/forbidden to prevent split-brain user administration.

## Trust boundaries

- Browser to API: TLS, bearer token, current-user database validation, rate limits.
- API to MySQL: parameterized values and allowlisted update fields.
- API to Brevo/B-Textman: server-side templates and database-derived recipients.
- API to file storage: authenticated access, generated names, size/type checks, canonical paths.
- Admin operations: explicit role/permission checks and audit records.

## Navigation

Developers see a Developers section in the CIMS sidebar. Dashboard, requests, approvals, notifications, reports, and audit views are rendered in the CIMS content area. Direct legacy `/developers` access remains a compatibility entry point and consumes the primary RIANA token.

## Rollback

Take a verified SQL backup before schema deployment. Apply migrations in order and record them in `migration_history`. To roll back, stop writes, restore the pre-deployment SQL backup, deploy the preceding application build, then run health and login checks.
