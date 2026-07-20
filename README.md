# RIANA CIMS

RIANA CIMS is the shared platform for Client Installation Management and the RIANA Developers change-request workspace. CIMS and Developers share one Express API, one MySQL database (`riana_cims`), one authenticated session model, and one permission system.

## Applications

- CIMS web interface: `/`
- Developers workspace: `/developers/`
- API and health check: `/api` and `/api/health`

Developer users are taken directly to the Developers workspace after signing in. Admin, SuperAdmin, Teamlead, Sales, Management, and other granted module users can open permitted Developers views from the same navigation. SuperAdmin remains the platform-wide authority across CIMS and Developers.

## Core Modules

- Dashboard: overview of operational activity and user-specific work.
- My Tasks: assigned installation work for regular users, including status/progress updates.
- My Profile: user identity, current assignments, profile picture, and security settings.
- Clients and Installations: client records, branches, equipment, schedules, and assignments.
- Assigned Technicians and Installation Progress: technician allocation, progress tracking, and reporting.
- E-Handover and Feedback: handover uploads, feedback links, client responses, and analytics.
- Reports and Analytics: performance, installation progress, feedback, and operational summaries.
- Users and Permissions: role, module role, and capability management.
- Company Settings: branding, SMTP, notifications, subsidiaries, equipment defaults, backups, and data management.
- Developers: CRMS-style change requests, approvals, assignments, reports, and audit trail.
- Help & Support: user guidance, chatbot support, support contact actions, and troubleshooting.
- Messages/Chat: authenticated user messaging with replies, secure attachments, image previews, downloads, read state, typing state, distinct loud message alerts, and audio/video call signaling.

## Local Setup

Requirements: Node.js 20+, npm 10+, and MySQL 8+.

```powershell
Copy-Item .env.example .env.local
cmd /c npm ci
cmd /c npm ci --prefix CRMS
cmd /c npm ci --prefix server
cmd /c node setup_db.cjs
cmd /c npm run start:all
```

Development URLs are `http://localhost:8090` for CIMS and `http://localhost:8081/developers/` for Developers. The shared API listens on port 8081.

## Production

The API serves both production frontend builds, so one Node process can serve the deployed application.

```powershell
cmd /c npm run build:all
cmd /c npx pm2 start ecosystem.config.cjs
cmd /c npx pm2 save
```

Alternative packaging commands:

```powershell
cmd /c npm run build:host
cmd /c npm run build:truehost
```

The hosting build includes `hosting/Mysql_host/riana_cims_host.sql`, which is intended to be schema/reference-data only. Do not package live accounts, reset tokens, customer contacts, messages, audit records, uploaded files, or provider credentials.

## Security

- Never commit `.env.local`, live backups, uploads, private keys, API tokens, SMTP credentials, SMS credentials, JWT secrets, or database passwords.
- Use HTTPS in production and set a strong production JWT secret.
- Keep database access restricted to the application host.
- User sessions include a session version so role, password, active-state, and privileged changes can revoke older sessions.
- Uploaded files are authenticated, size-limited, signature-checked, stored outside the public web root, and served through authorized backend endpoints. New private-file metadata lives in MySQL while file contents remain on private server storage.
- Profile pictures use the authenticated `/api/auth/avatar` endpoint and are limited to PNG, JPEG, or WebP files up to 5 MB.
- Two-factor authentication supports email, SMS, or voice call. SMS and call methods require a valid international phone number.
- Notification sounds are generated locally with Web Audio: messages use a distinct alert, incoming calls use a stronger ringtone-style alert, and operational notifications use separate assignment, announcement, and default tones.

## Verification

Run these before deployment or after security-sensitive changes:

```powershell
cmd /c npm run db:verify-unified
cmd /c npm run db:backup:verify
cmd /c npm run notifications:verify
cmd /c npm run build:all
```

For a focused CIMS build:

```powershell
cmd /c npm run build
```

`notifications:verify` uses provider mocks and sends nothing externally. Live notification tests must be run intentionally with an approved destination.

## Private File Storage

Set `PRIVATE_UPLOAD_ROOT` to a durable directory outside `public_html`, `public`, `dist`, `build`, and the deployment package. Apply `server/migrations/20260715_private_file_management.sql` or run `cmd /c npm run db:migrate` before enabling new file-management screens. See `docs/PRIVATE_FILE_MANAGEMENT.md` for backup, restore, migration, and rollback procedures.

Operational checks:

```powershell
cmd /c node server/scripts/inspect-file-storage.cjs
cmd /c node server/scripts/backup-private-files.cjs
```

## Operations

- PM2 process list: `cmd /c npx pm2 list`
- Restart production app after code changes: `cmd /c npx pm2 restart riana-cims --update-env`
- Save PM2 process list after startup changes: `cmd /c npx pm2 save`
- API health check: `curl http://localhost:8081/api/health`
- Public branding check: `curl http://localhost:8090/api/public/company-branding`

## Troubleshooting

- Vite proxy `ECONNREFUSED` usually means the backend process is not running on the configured API port.
- Browser `Failed to fetch` usually means the API is offline, the frontend is calling the wrong host, or the app was not restarted after environment changes.
- `Access denied` usually means the active user does not have the required capability or was routed to an admin-only module.
- If profile pictures do not change immediately, hard-refresh the browser and confirm `/api/auth/me` returns `avatar_url`.
- If 2FA SMS/call settings fail, confirm the phone number is entered with a valid country code and the notification provider is configured.
