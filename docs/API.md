# API Guide

All protected calls use `Authorization: Bearer <token>` and JSON unless uploading or downloading a file. The browser client uses the same token for CIMS and CRMS.

## Public endpoints

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/verify-2fa`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- Feedback link validation and token-bound submission endpoints

All other `/api` endpoints require an active database user. Backup endpoints require the backup-management capability. CRMS mutations additionally enforce module/action rules and object ownership or assignment.

## Errors

`400` invalid input, `401` missing/expired/stale session, `403` insufficient permission, `404` absent or inaccessible object, `409` conflicting state, `429` rate limit, and `500` an internal error without stack or provider secrets.

Clients must not retry mutating methods automatically. Safe GET/HEAD calls may use bounded retry with backoff.
## SuperAdmin and user-management API rules

- `GET /api/user_profiles` returns users with `module_roles`, effective `permissions`, and direct `extra_permissions`.
- `POST /api/user_profiles` allows Admin, Management, and SuperAdmin user creation; only SuperAdmin can create Admin, Management, or SuperAdmin accounts.
- `PUT /api/user_profiles/:id` allows SuperAdmin to update primary roles and `module_roles`; Admin and Management can update only non-privileged users.
- `DELETE /api/user_profiles/:id` requires user-management capability and cannot remove the acting account or a privileged target unless the actor is SuperAdmin.
- `GET /api/access/permissions` and `PUT /api/user_profiles/:id/permissions` are SuperAdmin-only. Direct grants are replaced transactionally, audited, and revoke the target session.
- `POST|PATCH|DELETE /api/subsidiaries` requires subsidiary-management capability. Delete returns `409` while attached users exist.
- Finance defaults to read-only operational/report capabilities. Management is denied installation/progress writes at the API boundary even if a direct grant is attempted.
- Company logo uploads use `purpose: "company-logo"`; all other uploads require installation-management capability.
- `POST|PATCH|DELETE /api/crms/profiles` and `/api/crms/user_roles` return `403` because CRMS user management is disabled by design.
- Server startup normalizes intended SuperAdmin account rows and CIMS/CRMS SuperAdmin module grants so a stale designation/role mismatch cannot silently remove platform authority.

## Subsidiary identity in document payloads

- Authentication responses include `subsidiary_name` so generated documents can apply the approved user/client subsidiary rule without changing the RIANA application shell.
- `/api/clients` and `/api/clients/:id` expose the client subsidiary name.
- `/api/crms/clients` and change-request `client` objects expose `subsidiary_id` and `subsidiary_name`; Developers PDF generation uses these fields and does not accept a client-supplied branding asset or arbitrary asset URL.
- Developers workflow notifications are dispatched by the API after the database event. A pending-approval request notifies active Sales users; an assignment notifies the selected developer; completion notifies the user who performed the latest assignment, with the senior developer as the legacy fallback. Each required event creates an in-app record and attempts email and SMS delivery using database-owned contact details.
