# Riana CIMS Release Change Inventory

Date: 2026-11-01  
Scope: current uncommitted working tree  
Decision: not approved for production release

## Purpose

This inventory classifies the current working tree without committing, pushing, deploying, restarting services, or applying a production migration. It distinguishes locally implemented code from staging and physical-device evidence that is still required.

## Working-tree baseline

- 67 changed or untracked entries were reviewed at the start of stabilization: 43 tracked modifications and 24 top-level untracked entries/directories (including nested test and evidence files).
- The changes remain uncommitted and must be preserved as one candidate workstream until the logical groups below are independently reviewed.
- `git diff --check` passed in the preceding validation cycle.
- No populated private key or credential assignment was found by the source scan. Matches were limited to runtime secret resolution and explicit replacement placeholders in the deployment builder.
- Generated `dist`, temporary `tmp`, Playwright report, test-result, runtime-data, and environment files are excluded by `.gitignore`.
- Browser/video evidence under `docs/evidence` was reviewed before release preparation. SHA-256 confirmed that `page@2b9a0129dcb98991ed3922e0602abd7f.webm` was byte-for-byte identical to the curated `riana-loader-preview.webm`; the redundant raw duplicate was removed after cleanup authorization. The second raw capture is distinct and retained as separate evidence.

## Change classification

### Communication and PWA

- `src/components/chat/ChatModule.tsx`
- `src/hooks/useChat.ts`
- `src/hooks/usePushNotifications.ts`
- `src/utils/communicationDevice.ts`
- `public/push-handlers.js`
- `server/services/messageRetention.js`
- `server/services/webPushDelivery.js`
- `server/scripts/run-message-retention.cjs`
- communication tests under `server/tests`
- `server/migrations/20261031_communication_backend_foundation.sql`
- communication reports and acceptance checklists under `docs`

Impact: participant media, active-speaker/layout controls, persistent calls, device-owned call acceptance, push delivery, retention, service-worker behavior, and staging procedures. Existing authentication and participant membership remain authoritative.

### Authentication, profile, sessions, and time

- `src/components/auth/LoginForm.tsx` and styling
- `src/components/profile/ProfileSettingsDialog.tsx`
- `src/components/layout/Header.tsx`
- `src/hooks/useAuth.ts`
- `src/utils/serverClock.ts`
- `src/utils/dateTime.ts` and tests
- `server/services/passkeyService.js`
- `server/services/accountMfa.js`
- `server/migrations/20261101_passkeys_and_account_security.sql`
- `server/migrations/20261101_passkeys_and_account_security.rollback.sql`
- `server/migrations/20261101_totp_recovery_and_preferences.sql`
- `server/migrations/20261101_totp_recovery_and_preferences.rollback.sql`
- `src/components/auth/SecureAppLock.tsx` and `src/utils/appLock.ts`
- `docs/ACCOUNT_SECURITY_AND_PASSKEYS.md`

Impact: server-synchronized timezone greetings, password/MFA enforcement, encrypted TOTP, one-use recovery codes, passkeys, verified identity changes, backend sessions, server-owned interface preferences, and resumable restricted-session locking. Migrations are additive; provider delivery, physical authenticators, and exact HTTPS origin/RP configuration remain staging gates.

### API and security foundation

- `server/index.js`
- `server/security/apiSecurity.js`
- `src/integrations/apiClient.ts`
- `package.json` and `package-lock.json`

Impact: authenticated endpoints, authorization checks, WebAuthn, communication state, notification summaries, security headers/rate limits, scripts, and dependencies. API compatibility and tenant/subsidiary restrictions require staging role-matrix regression.

### CIMS UI/UX

- shared UI primitives under `src/components/ui`
- layout, sidebar, notification, noticeboard, dashboard, loader, and global styles
- `src/pages/Index.tsx`
- `vite.config.ts`
- UI/UX reports and matrices in the repository root and `docs`

Impact: responsive styling, accessibility states, call presentation, navigation, dashboard composition, loader/PWA packaging, and visual documentation. Full viewport, zoom, light/dark, keyboard, and authenticated-role coverage is not yet evidenced.

### CRMS UI/UX

- `CRMS/src/NativeWorkspace.tsx`
- dashboard, header, page, and shared primitive changes under `CRMS/src`

Impact: visual consistency and responsive dashboard behavior. Build and unit tests passed locally; role-specific browser acceptance remains pending.

### Hardware, inventory, scheduling, and business modules

No broad schema rewrite is included in this working tree. Existing handover export behavior and hardware/inventory workflows must be regression-tested. Documented outstanding product gaps include signed handover amendments, scheduled stock alerts, consistent snapshot export, combined maintenance/removal flows, and timed email/SMS notification execution. These are not to be represented as completed by the UI modernization.

## Database state and migration boundary

| Migration | Local development | Staging | Production |
|---|---|---|---|
| `20261031_communication_backend_foundation.sql` | Applied; local migration history recorded | Not verified | Not authorized/not applied by this work |
| `20261101_passkeys_and_account_security.sql` | Applied; local migration history recorded | Not verified | Not authorized/not applied by this work |
| `20261101_totp_recovery_and_preferences.sql` | Applied successfully 2026-11-01; migration history recorded | Not verified | Not authorized/not applied by this work |

Required staging evidence: backup/restore, migration sequence, existing-row counts, foreign keys, indexes, uniqueness, repeat behavior, API compatibility, retention dry-run, application rollback, and reviewed schema rollback. Additive tables should normally remain during an application rollback to avoid destructive credential/message metadata loss.

## Validation baseline

The latest completed local validation before this inventory recorded:

- backend tests: 101 total, 99 passed, 2 isolated-database suites skipped, 0 failed;
- communication tests: 11 passed;
- authentication/time tests: 13 passed;
- CRMS tests: 7 passed;
- TypeScript: passed with zero errors;
- targeted lint: passed;
- source-wide ESLint inventory: zero errors and 392 warnings across 275 files;
- CIMS production build/PWA: passed, 6,191 modules and 107 precache entries;
- CRMS production build: passed, 3,256 modules;
- production dependency audit: zero vulnerabilities;
- local API and frontend health checks: HTTP 200 at the time of validation.

Skipped database suites, physical-device checks, staging checks, and authenticated role/subsidiary browser checks are not passes.

### Local runtime activation

On 2026-11-01 the local migration runner applied only `20261101_totp_recovery_and_preferences` and skipped all previously recorded migrations. PM2 then restarted only the `riana-cims` API and `riana-cims-web` processes. The API health endpoint on port 8081 and web application on port 8090 both returned HTTP 200. A Playwright 390×844 login smoke test rendered meaningful branded content, accepted non-submitted email text, exposed the expected login controls, and reported no console or page errors. This confirms local activation only; it does not satisfy authenticated role, provider, physical-device, staging, or production acceptance.

## Proposed logical review/commit groups

These are preparation groups only; no commit is authorized.

1. Communication persistence, media UX, push, retention, tests, migration, and acceptance documentation.
2. Account security, passkeys, sessions, profile preferences, server time, tests, migration, and rollback documentation.
3. CIMS UI/UX primitives, layout, dashboard, loader, accessibility, and reports.
4. CRMS UI/UX primitives, layout, dashboard, and regression evidence.
5. API security/dependency integration changes that cannot safely be isolated from groups 1–2.

Before any future commit, re-run secret scanning, inspect staged paths per group, exclude raw/duplicate evidence, run `git diff --check`, and execute the relevant tests/builds.

## Rollback strategy

- Application rollback: redeploy the last approved application revision and disable newly exposed communication/passkey features through existing configuration gates where available.
- Database rollback: prefer leaving additive communication/passkey tables intact during application rollback. Run destructive rollback SQL only after backup verification, retention review, and explicit database authorization.
- Push/SFU: disable sender/token configuration first; revoke staging credentials if exposure is suspected. No production SFU/TURN service is enabled by this working tree.
- Client/PWA: publish a new service-worker revision through the normal controlled release path; do not manually delete user browser data.
- Evidence/docs: preserve the authoritative status and validation records with the release candidate.

## Outstanding release blockers

- Staging migration and rollback verification on an isolated production-like database.
- Two physical-device WebRTC, cross-device acceptance, background push, reconnect, and passkey acceptance.
- SFU/TURN provisioning, authorization, traversal, capacity, host-control, and monitoring evidence.
- Complete authenticated role, permission, subsidiary/tenant-isolation, light/dark, viewport, 200% zoom, and workflow regression.
- Resolution or explicit risk acceptance for newly introduced ESLint warnings; current warning provenance still requires baseline comparison.
- Review of raw/duplicate evidence artifacts before release packaging.

Until these gates are closed, the correct decision is **not production-ready**.
