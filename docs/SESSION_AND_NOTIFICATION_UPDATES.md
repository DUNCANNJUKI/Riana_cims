# RIANA CIMS Session and Notification Update Notes

## Scope

This update modernizes the login page, adds context-aware notification labels and subjects, and enforces one active login session per user across CIMS and Developers/CRMS JWT login flows.

## Authentication Method

RIANA CIMS continues to use signed JWTs delivered through the existing Bearer-token/local-storage flow and `riana_session` HttpOnly cookie. New tokens include a `sid` claim and are verified against the server-side `user_sessions` table on protected requests.

Latest successful login wins. A newer login revokes older active sessions for the same user. Revoked or replaced sessions return a 401 response with one of:

- `SESSION_REPLACED`
- `SESSION_REVOKED`
- `TOKEN_EXPIRED`
- `ACCOUNT_DISABLED`

The frontend clears stored auth state and redirects to the login page for those codes.

## Database Migration

Apply migration `20260724_notifications_and_single_sessions` with the existing migration runner:

```bash
npm run db:migrate
```

The migration:

- Creates `user_sessions`.
- Adds `crms_notifications.notification_type` with default `GENERAL`.
- Backfills missing notification types to `GENERAL`.
- Adds an index for notification type/history lookup.

Rollback file: `server/migrations/20260724_notifications_and_single_sessions.rollback.sql`.

## Notification Behavior

Notification type normalization is centralized in `server/services/notificationTypes.js`. Existing legacy notification identifiers still keep their historical subjects, while canonical types such as `APPRECIATION`, `REQUEST`, `UPDATE`, and `RESOLUTION` determine the message label.

Older notifications without a type safely display as `GENERAL` / `Message`.

## Deployment Notes

Because old JWTs do not contain a `sid`, currently signed-in users may be asked to sign in again after deployment. This is required to enforce immediate server-side single-session validation.
