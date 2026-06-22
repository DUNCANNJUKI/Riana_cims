# API Guide

All protected calls use `Authorization: Bearer <token>` and JSON unless uploading or downloading a file. The browser client uses the same token for CIMS and CRMS.

## Public endpoints

- `GET /api/health`
- `POST /api/login`
- `POST /api/verify-2fa`
- Password reset request/completion endpoints
- Feedback link validation and token-bound submission endpoints

All other `/api` endpoints require an active database user. Admin backup endpoints require Admin. CRMS mutations additionally enforce module/action rules and object ownership or assignment.

## Errors

`400` invalid input, `401` missing/expired/stale session, `403` insufficient permission, `404` absent or inaccessible object, `409` conflicting state, `429` rate limit, and `500` an internal error without stack or provider secrets.

Clients must not retry mutating methods automatically. Safe GET/HEAD calls may use bounded retry with backoff.
## SuperAdmin and user-management API rules

- `GET /api/user_profiles` returns users with `module_roles` so CIMS can show extra Developers workspace access.
- `POST /api/user_profiles` allows Admin/SuperAdmin user creation, but only SuperAdmin can create Admin or SuperAdmin accounts.
- `PUT /api/user_profiles/:id` allows SuperAdmin to update primary roles and `module_roles`; Admin can update only non-privileged users.
- `DELETE /api/user_profiles/:id` is SuperAdmin-only.
- `GET|POST /api/admin/backup*`, `GET /api/admin/db-stats`, and `PUT /api/companies` are SuperAdmin-only.
- `POST|PATCH|DELETE /api/crms/profiles` and `/api/crms/user_roles` return `403` because CRMS user management is disabled by design.
