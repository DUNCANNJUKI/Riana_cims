# RIANA CIMS

RIANA CIMS provides Client Installation Management and the Developers change-request workspace through one Express API, MySQL database, session model and permission system. This README is the repository's single maintained documentation source; the former `docs/` tree has been retired so operational guidance stays versioned here.

## Applications and access

| Application | Route |
| --- | --- |
| CIMS | `/` |
| Developers | `/developers/` |
| Client Requests | `/developers/client-requests` |
| API and release health | `/api`, `/api/health` |

Modules include clients, installations, technician assignments, inventory, scheduling, tasks, handovers, feedback, reports, user permissions, company settings, Developers requests, support and communication. Developer accounts enter their workspace after sign-in; other roles use their granted modules. SuperAdmin retains platform-wide authority.

### Business and inventory roles

Super Admin can create and assign **Head of Business** and **Inventory Officer** accounts. Head of Business requires a primary subsidiary. To grant access to more subsidiaries, open the saved Head of Business account in **Users**, select the additional subsidiaries under **Delegated subsidiaries**, and save. Head of Business can switch between their authorized subsidiaries on **Business overview**. The API checks every delegated request against the current grants.

Head of Business can maintain clients, branches, departments, installations, and technician assignments in the selected subsidiary. Installation and assignment writes validate the client, branch, department and staff references in the same transaction. Commercial decisions are available for pending change requests and retain the existing approval audit and notification path. Staff status controls apply to standard User accounts in the selected subsidiary. Reactivation can reverse only a suspension recorded through the business dashboard. Platform settings, staff role grants, client deletion, technical approvals, inventory selection, and signed-handover workflows use their existing authorized roles.

An Inventory Officer can use **All subsidiaries** or filter the inventory to a specific subsidiary. The user account can have no subsidiary. Registration and other stock operations still require the owning or destination subsidiary where applicable. Cross-subsidiary transfers require an approval reference and a location in the destination subsidiary. Inventory documents follow equipment access; unrelated files are scoped separately.

Before staging deployment, create and verify a backup and apply `20261127_business_inventory_roles.sql` and `20261127_business_delegation.sql` with the ordered migration runner. Verify the role catalogue and sign in with scoped test accounts before assigning either role. The migrations add the role enum value, permission catalogue entries, delegation and suspension records without changing existing profile assignments. For rollback, keep the additive schema and use a build that understands the new enum. An older build that narrows the enum requires a reviewed account migration or verified database restore before startup if any Head of Business profiles exist.

## Local setup

Use Node.js 22.12+ or 24, npm and the configured MySQL-compatible server. The API's standalone minimum is declared in `server/package.json`; the complete frontend/test toolchain requires the newer Node version.

```powershell
Copy-Item .env.example .env.local
npm.cmd ci
npm.cmd ci --prefix server
npm.cmd ci --prefix CRMS
node setup_db.cjs
npm.cmd run start:all
```

Configure a new local environment before setup. Never run clean-install SQL or `setup_db.cjs` over an existing production database. CIMS development runs at `http://localhost:8090`; the API and built Developers workspace use `http://localhost:8081`. Vite alone requires a separate API process.

For managed local services:

```powershell
node node_modules/pm2/bin/pm2 start ecosystem.config.cjs --only riana-cims,riana-cims-web
node node_modules/pm2/bin/pm2 restart ecosystem.config.cjs --only riana-cims,riana-cims-web --update-env
```

Verify API `http://127.0.0.1:8081/api/health` and web `http://127.0.0.1:8090` after restarting. PM2's online state alone is insufficient. Keep unrelated applications under their existing process owners.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run lint --prefix CRMS
npm.cmd test
npm.cmd run build:all
npm.cmd run test:isolated-db
npm.cmd run test:call-background:browser
npm.cmd run test:passkeys:browser
```

The default tests skip two opt-in database integrations; `test:isolated-db` runs them in uniquely named guarded local fixture databases. Browser background QA uses real MediaPipe processing and native WebRTC loopback with synthetic video/silent audio. Passkey browser QA uses a virtual authenticator and an isolated database. Neither certifies a physical sensor, real human foreground segmentation, actual multi-device/TURN transport or production account sign-in. Fixture databases remain available for inspection.

Builds, local tests, Git pushes, hosted CI and production deployment are separate outcomes. Match public health's release SHA to the deployed commit before claiming release success.

## PWA startup verification

Run `node scripts/generate-pwa-icons.cjs` after changing the official startup artwork or iOS size list. The Android splash uses the installed manifest's light background and centered icon. iOS portrait launch images use the operating system color preference for the sizes in `scripts/pwa-startup-sizes.json`. Once the document opens, it restores the saved CIMS theme. Native splash appearance and installed icon refresh timing are controlled by the platform.

With Vite dev and a local preview of the production build running, pass their URLs to `node scripts/qa/pwa-startup-browser.cjs <dev-url> <preview-url>`. It checks Chrome startup, retry, theme, reduced motion, installability and offline launch using a fresh test profile. Verify native launch visuals separately on physical iOS and Android devices.

## GitLab CI and deployment

GitLab `main` runs dependency audits, security scanning, tests, type checks, lint, browser background QA and both frontend builds before the production deploy stage. Production remains serialized by its resource group. The current main-branch deployment runs automatically after required checks, following the existing GitLab deployment policy.

The deployment job checks the configured SSH host key, excludes environment files and operational storage from synchronization, and calls `server/scripts/deploy-production.sh` with the full commit SHA. That helper installs locked API dependencies, creates and verifies a backup, applies ordered additive migrations, checks passkey readiness, writes the private release marker, restarts the existing API owner and verifies release health. Public verification then checks the document policy and runtime assets.

An SSH root login invokes root's existing PM2 directly. A non-root login managing root-owned PM2 uses the existing noninteractive sudo authorization. No second PM2 daemon, arbitrary process kill or privileged credential change is a recovery substitute. Backup, migration, readiness and restart failures must stop deployment.

GitLab project: [q-sys1/cms](https://gitlab.com/q-sys1/cms).
[Pipeline results and retries](https://gitlab.com/q-sys1/cms/-/pipelines).
A failed historical pipeline reruns its original commit. Deploy the latest verified commit to avoid overwriting production with older code. Existing failed-job retries require an authenticated browser session or GitLab API credentials with sufficient scope; Git push access alone does not provide that access.

## Client Requests recovery

The page reads `GET /api/crms/change_requests`, `GET /api/crms/invitations` and optional `GET /api/crms/account-manager/stats`. Authentication, module roles and server-side record scope remain required. Client contact data uses canonical `clients.contact_phone` and `clients.contact_email`, retaining frontend aliases.

A list request returning 404 must produce a persistent error and Retry control, rather than presenting an empty list as a successful load. Previously loaded records remain visible with a stale-data notice when refresh fails. A successful retry clears the error. Do not create records or widen permissions to conceal a missing API route.

For production 404s, inspect the authenticated failing Network request, deployed API working directory and full release SHA. Missing-schema failures usually return 5xx rather than a route 404; do not change schema based only on the toast. The public health marker `features.clientRequestPortal` identifies the route-module version loaded by the API. Production verification requires the expected release and that marker. A general HTTP 200 health response does not certify the authenticated request workflow.

The client portal migration is `server/migrations/20261110_client_change_requests_portal.sql`, included in the ordered production runner. Back up first. Preserve invitations, representative contacts, tokens, reports, acceptance records and audit history. Public token/OTP workflows, signed acceptance declarations and attachment access checks remain enforced.

## Communication and virtual backgrounds

The existing authenticated messaging and bounded peer-to-peer calling module provides participants, device controls, reactions, hand state, screen sharing, recording and background effects. It is a mesh implementation; SFU capacity and TURN infrastructure require separate provisioning and acceptance. Optional effect failure must preserve the original camera and audio.

Select **Messages → New call**, choose one colleague for a direct call or multiple colleagues for a group call, and select **Audio call** or **Video call**.

In a group meeting, **Leave** disconnects your participant session. The meeting continues while another joined participant remains. The joined organizer can use **More meeting options → End for everyone** and confirm to close the meeting. Direct calls still end when either party hangs up. On refresh, the active-call lookup restores membership for the owning device. Use **Reconnect camera and microphone** to reopen local media.

The dashboard, notification panel, and Communication use the same authenticated meeting state. Select **Join now** or **Rejoin** to review available devices and choose initial microphone and camera settings before joining. `CHAT_MEETING_REJOIN_GRACE_SECONDS` defaults to 300 seconds and accepts 0–3600 seconds. The grace period applies to previously joined members of an ongoing group meeting. Setting it to zero disables rejoin after explicitly leaving. You can move the minimized meeting window with its drag handle or the arrow keys.

The ringing timeout applies before a call starts. Participants invited to an in-progress meeting can join while it is active, even if Web Push delivery fails. An explicit decline, invitation cancellation, or meeting end closes the invitation.

Open **Messages → Scheduled meetings** to reserve an audio or video meeting and select attendees. The organizer starts or cancels it from the same list. When it starts, attendees receive the usual call invitation. In an active group meeting the organizer can use **Participants → Make organizer** to hand off control. If the organizer leaves through CIMS, the longest joined participant takes over. Recording permissions follow the existing recording policy.

In **Preferences → Notifications & preferences**, use **Enable device notifications** for background alerts and **Test alert sound** to check in-app sound. An incoming call rings while the workspace can run and shows a pre-join overlay. **Silence ringtone** stops that call's ringtone. Background delivery requires configured VAPID and a browser subscription. Browser autoplay rules can require a click or tap before in-app sound plays. The OS controls notification sound for background and closed-app delivery.

Apply `20261127_meeting_coordination.sql` through the existing backup-verified migration runner before staging or deployment. It adds scheduled meetings, organizer ownership and presence tracking. Clients renew presence every 30 seconds while in a call. A minute-based cleanup closes an active meeting after all joined devices with recorded presence have been idle for ten minutes. Meetings with untracked legacy clients are preserved. Roll back by restoring the prior application build and retaining the additive tables and columns for later recovery.

Production background failure was reproduced on `https://rianacims.marezi.co`: its document CSP rejected even a minimal WebAssembly module. The loader, WASM and model endpoints returned valid assets. The repository's security middleware permits only the additional `'wasm-unsafe-eval'` capability; JavaScript eval and external script origins remain blocked. A proxy/edge policy can still block execution even if another header permits it.

The build now stages matching SDK/runtime/model files under content-versioned URLs and emits `dist/call-background-runtime.json`. New bundles cannot select old CacheFirst entries under another revision. No authentication storage or user data is cleared. Generated runtime binaries, manifests and build outputs are not committed.

Run the read-only public check after deployment:

```sh
node server/scripts/verify-communication-runtime.cjs --origin https://rianacims.marezi.co --release FULL_COMMIT_SHA
```

It checks every enforced document CSP, the release, current runtime manifest, asset hashes, lengths, MIME types and binary/model signatures. GitLab runs this required check after deployment, when the new release is expected to be live. Do not remove CSP or enable global JavaScript eval. The [CSP specification](https://www.w3.org/TR/CSP3/) explains the narrower WebAssembly permission.

Local synthetic QA verified blur, preset/custom/Off, rotation, simulated camera replacement, decoded receiver frames, audio continuity and blocked-policy recovery at desktop/mobile harness sizes. Physical devices, human segmentation quality, installed-PWA upgrade behavior and real multi-device calls still need acceptance. MediaPipe's optional telemetry remains blocked by `connect-src 'self'`; do not expand network permissions to silence it.

## Account security and passkeys

Use HTTPS, a strong configured production JWT secret and the existing session/MFA controls. Password, active-state and privileged account changes can revoke sessions. Passkey enrollment requires recent password verification and user verification; challenges are single-use, time-limited and session-bound.

For the Marezi production origin, the deployed API environment must contain:

```dotenv
WEBAUTHN_ORIGIN=https://rianacims.marezi.co
WEBAUTHN_RP_ID=rianacims.marezi.co
WEBAUTHN_RP_NAME=RIANA CIMS
```

Use the exact deployment domain; passkeys are scoped to their relying party. The additive `20261101_passkeys_and_account_security.sql` migration creates credentials and challenges without deleting existing account data.

```sh
NODE_ENV=production node server/scripts/verify-passkey-readiness.cjs --origin https://rianacims.marezi.co
```

The checker loads the API's root environment while preserving inherited values and reads schema metadata only. It reports configuration, dependency or schema readiness without exposing credentials, challenges or keys. Use the same process environment as PM2. Missing production configuration fails closed; do not bypass the readiness gate. Physical acceptance requires adding a passkey, confirming the entry, signing out and signing in with that passkey and any required MFA.

## Database, inventory and scheduling

Apply migrations against the intended existing database only after a verified backup. The GitLab runner verifies migration history and required schema. Manual packages provide one ordered `LIVE_DB_UPDATE_ALL.sql` or their explicitly named live-update entrypoint. Do not combine old release SQL with a newer consolidated entrypoint. `hosting/Mysql_host/riana_cims_host.sql` is a sanitized clean-install/reference export with destructive table definitions; it is not a production backup.

Inventory allocation uses model/equipment mappings and atomic transactions. Subsidiary serial requirements, feature flags and storage policy govern issuance; missing policy must not silently enable allocation. Retain issued serials, assignment history, references, counters and uploaded evidence. QR labels use the correct HTTPS deployment origin and expose only their intended public redacted view.

Equipment previews use the original kiosk, TV, LED service point and media controller images extracted from the Lifecare Kikuyu survey. The transparent WebP assets are in `public/equipment`, and the display mapping is in `src/utils/equipmentImages.ts`. The PWA build precaches all four images for installed clients after the new service worker activates.

Enable hardware/scheduling features only after their required migrations and policy are configured. Verify scoped calendar access, time zones, `/api/time`, overlapping-booking rejection, recurrence and reminder transactions. Keep host/database clocks synchronized. Current scheduling reminders are in-app; do not claim live SMS/email delivery from mocked provider tests.

## Private files, backups and notifications

Keep `PRIVATE_UPLOAD_ROOT` outside public web directories and use the existing external `LEGACY_UPLOAD_ROOT` for legacy files. Preserve host-specific paths; do not copy local Windows storage paths into Linux configuration. Metadata is stored in MySQL; file contents remain in private storage with authenticated, scoped access and signature/size checks.

```powershell
npm.cmd run db:backup:verify
node server/scripts/inspect-file-storage.cjs
node server/scripts/backup-private-files.cjs
npm.cmd run notifications:verify
```

Back up database metadata and private/legacy uploads together. Restore into a test location before production recovery. Missing legacy handovers require restoring the matching original upload or re-uploading through the authorized workflow; do not expose files under the public web root. Retain originals and rollback mappings during storage migration.

`notifications:verify` uses mocks and sends nothing externally. Live SMS/email/voice tests require an approved destination and configured provider. Preserve payment and notification integrations during maintenance.

## Packaging and cleanup

```powershell
npm.cmd run build:host
npm.cmd run build:deployment
```

Package source, required SQL, verified frontend assets and locked dependency manifests. Exclude live accounts, contacts, messages, tokens, credentials, backups, uploads and runtime state from release artifacts. The cloud patch builder includes this README instead of deleted standalone reports.

Keep `.runtime/`, `server/.runtime/`, uploads, private uploads, backups and environment files outside Git and Docker build contexts. Audit generated output before cleanup. Preserve operational logs and recovery snapshots. Use Git history for retired documentation; this repository maintains one README instead of dated reports.

## Rollback and support

Restore a matching application/frontend release and lockfiles together, then restart only the managed Riana applications and verify HTTP health. Retain additive communication/passkey/inventory schema and its data; do not drop tables or issued records for an application rollback. Assess writes since a backup before database recovery.

For login/API failures, check direct health and the Vite proxy separately. Inspect sanitized status/error codes, PM2 working directory and release marker. A missing route, missing migration, expired session and unavailable provider need different remedies. Never share passwords, authorization headers, cookies, private keys, passkey responses or populated environment files in diagnostics.

Validation on 12 November 2026: the default aggregate passed 228 tests with two opt-in database cases skipped. Both database integration cases passed separately against newly created disposable databases. TypeScript and both production builds passed; root lint reported no errors and 103 existing warnings, and CRMS lint passed. Root, API and CRMS dependency audits reported zero vulnerabilities. Isolated Chromium verified the actual Client Requests page at 1366px and 390px: the missing-route error remains visible, Retry recovers records, and no JavaScript errors occur. Component tests also cover refresh failure retaining records and malformed API responses. The cloud package smoke check validated 477 file checksums, README inclusion and exclusion of operational data.

Production was still reporting an unversioned API without the client-request feature marker during this review. The stored GitLab credential permits Git operations but lacks pipeline API scope, and no authenticated browser session was connected. Existing failed-job retries and the production release therefore remain unverified. Physical passkey enrollment/sign-in, installed-PWA behavior, real multi-device calls and actual external-provider delivery require separate acceptance; local tests do not certify them.
