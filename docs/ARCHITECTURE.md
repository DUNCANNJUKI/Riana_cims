# System architecture

## Runtime

The production Node process in `server/index.js` exposes the CIMS API, the Developers API, the built CIMS SPA, and the built Developers SPA. The main application is served at `/`; the Developers build uses the `/developers/` base path.

Both APIs import the same pool from `server/db.js`. CRMS tables use the `crms_` prefix, while clients and users are shared through `clients` and `user_profiles`. No browser runtime connects directly to Supabase or a second database.

## Authentication

CIMS issues a signed JWT. When an authenticated Developer enters the Developers module, the parent application sends that JWT to the embedded workspace with a same-host `postMessage`. The Developers API validates the same JWT secret and restricts access to Admin, Teamlead, Developer, and Sales roles.

## Notifications

In-app notifications are persisted in `crms_notifications`. `notificationDispatcher.js` coordinates persistence, Brevo email, and B-Textman SMS, then records `email_sent` and `sms_sent`. Account creation, assignments, password reset/change, feedback requests, and CRMS status events use the shared delivery services.

## Backups

`databaseBackup.js` creates a transactionally consistent SQL backup through the configured MySQL pool. It writes to a temporary file, rejects empty output, atomically renames successful output, and prunes files older than `BACKUP_RETENTION_DAYS`. The scheduler is initialized once and uses `BACKUP_TIMEZONE`.
