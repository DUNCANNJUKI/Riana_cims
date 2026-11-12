# Client-request repair and review follow-up — 12 November 2026

## Result

The invitation form now loads all three registered local clients. The backend selected `contact_person_phone` and `contact_person_email`, which do not exist in the operational `clients` table. It now selects canonical `contact_phone` / `contact_email` with the legacy frontend aliases preserved. No schema migration or client-data edits were needed.

The form exposes loading, failure/retry and genuine empty states. Changing clients clears previous representative details before applying the selected contact. The read-only local query and the rendered dialog were checked together at 1440px and 390px. All three options appeared, retry recovered from a simulated failure, and phone autofill matched the selected client.

## Completed follow-up work

| Item | Outcome |
| --- | --- |
| Missing clients | Fixed canonical SQL columns; added client-list success/error regression tests; no raw database details in failure responses |
| Public invitation/submission | Removed duplicate `/api` URL prefixes; aligned flat API response and representative fields; corrected submission field/attachment names; handled already-submitted links; submission now returns a tracking URL |
| Public completion review | Aligned response fields, OTP channel/result, OTP verification, signature upload and correction/dispute payloads with existing backend contracts |
| Acceptance controls | Server requires explicit boolean declaration before acceptance; signature endpoint restricts files to supported image types; client actions disappear once report no longer awaits acceptance |
| Completion attachments | Token/expiry-checked indexed downloads, attachment disposition, no-store and nosniff headers; review JSON returns metadata rather than base64; client renders download links; editor retains existing attachments |
| Public tracking | Reads the existing flat status response and renders the server's current stage; no fabricated historical stage timestamps |
| Responsive forms | Fixed stacked button groups causing mobile horizontal overflow |
| Isolated MySQL coverage | Both suites executed successfully in fresh local databases, covering migration reruns, concurrency, scope, assignment, governance, reconciliation, snapshots, scheduling policies/history and reminder transactions |
| Reproducible database tests | Added `npm.cmd run test:isolated-db`; creates unique guarded local test database names and retains fixtures for inspection; never reuses/drops the operational database |
| Development vulnerabilities | CRMS migrated to Vite 8.3.8 / React plugin 6 / Vitest 5.1; root Vite and PM2 tooling patched; scoped transitive fixes for parser, minimatch, glob, FTP, YAML and deepmerge chains |
| CI dependency checks | GitHub/GitLab audit checks now include development dependencies |
| Cleanup | Removed temporary browser/toolchain fixtures, a stale locked native-binding directory after restart, and scratch lint output; retained test logs and operational data |

Tool migration references: [Vite migration](https://vite.dev/guide/migration), [Vitest migration](https://vitest.dev/guide/migration/). Vitest 5 requires Node 22.12 or later; CI/Docker already use Node 22 and local validation used Node 24. Scoped dependency overrides are security maintenance constraints and should be revisited when upstream packages adopt fixed versions. ZIP packaging and actual production/PWA builds passed with the overrides.

## Validation evidence

| Check | Result |
| --- | --- |
| Full aggregated tests with isolated database environment | **207 passed, 0 failed, 0 skipped**: frontend 21, API 160, CRMS 10, script tests 16 |
| Isolated test names | `cims_hardware_test_hw_final_1794431819377`, `cims_hardware_test_sc_final_1794431819377` |
| Complete dependency audit, including development | **Root 0, CRMS 0, API 0** advisories |
| TypeScript | Main frontend, Vite config and CRMS passed |
| Lint | 0 errors; 381 existing warnings: 330 explicit-any, 34 hook dependencies, 17 fast-refresh exports |
| Builds | Main and CRMS production builds passed; PWA precache generated and production bundle markers verified |
| Packaging | Real ZIP creation/signature smoke test passed |
| CI config | GitHub and GitLab YAML parsed; diff whitespace validation passed |
| Invitation browser check | 1440px and 390px, actual local read-only client query supplied to isolated component fixture; 3 options, retry and autofill verified, no page errors/overlay |
| Public portal browser checks | Synthetic API fixtures at 1440px and 390px: submission, review and tracking render; no page errors, overlays or horizontal overflow; request submission and OTP acceptance payloads verified |
| Attachment security tests | Metadata excludes inline data; valid-token download returns original bytes/no-store; expired token returns 410; acceptance declaration required before querying/writing |
| Local runtime | Restarted only Riana API/web using existing PM2 ownership; unrelated POS processes retained |

Browser plugin was unavailable; installed Playwright/Chromium was used. Invitation evidence: `%TEMP%/riana-clients-qa-4KorLg/clients-1440.png` and `clients-390.png`. Public-page evidence: `%TEMP%/riana-portal-final-jnXmOO/`. Full final test output: ignored `.runtime/final-review-tests.log`. Synthetic tests did not create real invitations, send OTPs/messages, or accept operational requests. They establish client/API contract compatibility rather than real-provider delivery.

## Remaining work that is not claimed complete

### Retry and passkey verification update

The interrupted type-cleanup changes have been repaired and validated. Explicit `any` catches now use `unknown` and a tested diagnostic reader; shared client/assignment/feedback/announcement/handover/report contracts and typed jsPDF graphics/table fields replace unsafe casts. UI variant constants and form/sidebar hooks were moved out of component refresh boundaries, with internal imports updated and rendered styling retained. Lint now reports **0 errors and 102 warnings** (65 explicit-any, 34 hook dependencies, 3 remaining mixed exports), down from 381. Rules were not disabled. The 102 warnings remain open; this update does not represent full backlog completion.

Validation: frontend tests 23 passed, API 158 passed with 2 isolated cases skipped by the default command, CRMS 10 passed, script tests 16 passed; both isolated MySQL cases subsequently executed and passed. Thus 209 distinct automated cases passed across those runs. Main/CRMS type checks and production/PWA builds passed. Desktop/mobile Finance edit/save/reload regression passed at 1366px and 390px with no page errors; native WebRTC offer/answer state smoke passed, without claiming a real call transport test. Typed PDF graphics-state generation passed. Only Riana API/web processes were restarted, and both HTTP endpoints returned 200.

**Passkeys:** `npm.cmd run test:passkeys:browser` now runs actual browser WebAuthn enrollment and assertion generation against the production `passkeyService` and the real migration schema in a newly created isolated MySQL database. Chromium's virtual platform authenticator supplies user verification. Registration and authentication passed. Registration replay, assertion replay, wrong origin, bad signature, missing user verification, expired challenge and revoked credential were all rejected. The latest fixture database is `cims_hardware_test_passkey_1794460236062_ddda89`; no operational account or credential was modified. Both passkey tables exist in the operational local schema. The actual login page's passkey button and missing-email guard also passed browser verification.

This verifies the WebAuthn software path, not a physical fingerprint/face sensor or a complete real-account session/MFA sign-in. The user was asked to complete their device's passkey prompt; physical-device confirmation is pending. Workflow reference: [SimpleWebAuthn server verification](https://simplewebauthn.dev/docs/packages/server). Virtual-device mechanism: [Chromium WebAuthn protocol](https://chromedevtools.github.io/devtools-protocol/tot/WebAuthn/).

- The remaining 102 lint warnings require further typed-data and hook-lifecycle refactoring with module-level regression coverage. They are not build errors.
- Physical two-device/browser calling, camera/microphone permissions, TURN/SFU provisioning/capacity and real SMS/email delivery require physical endpoints or approved test recipients/infrastructure. These were not simulated as successful live acceptance.
- Full authenticated tenant/subsidiary/role browser acceptance and live database repair/rollback certification remain separate checks. The repaired form was tested with the real read-only client query in an isolated browser component, not by reusing the user's live authenticated session.
- Docker is not available in this execution environment, and no hosted CI, staging deployment, remote push or production deployment was performed. Local YAML parsing/builds do not establish those outcomes.
- Older roadmap statements about hardware workflow or notification features are not a sufficiently specific acceptance specification for inventing or changing production business rules. The relevant isolated hardware/scheduling suites now pass; other roadmap acceptance remains as documented.

No operational database schema/data or authentication rules were altered. Separate disposable databases created during verification contain fixtures only and are retained for inspection. Backups, uploads, credentials, audit/runtime logs and recovery snapshots are preserved.

## Production passkey enrollment investigation

The user clarified that the failure is **adding a passkey on `https://rianacims.marezi.co`**. Its public `/api/health` returned HTTP 200 with `status: ok` and `release: unversioned`; this establishes general API availability, not enrollment readiness or the deployed Git SHA. The exact authenticated failing response and production environment/schema are not yet available, so the production root cause is not claimed confirmed.

Two repository defects were confirmed and repaired:

- The production migration runner omitted `20261101_passkeys_and_account_security`; it now includes that additive migration and verifies both tables and every column used by the service.
- The frontend masked `PASSKEY_CONFIGURATION_REQUIRED` and `PASSKEY_MIGRATION_REQUIRED` behind the generic 5xx message. It now shows safe, actionable passkey-specific guidance without exposing database/server diagnostics.

Added a read-only production readiness checker for explicit HTTPS origin, matching RP ID, dependency loading and required schema columns. Deployment runs it after verified-backup migrations and before setting the release marker or restarting PM2. A failure stops deployment; it does not roll back installed dependencies or already executed MySQL DDL. [Production recovery guide](PASSKEY_PRODUCTION_RECOVERY.md) documents the exact Marezi settings, diagnostics, physical-device acceptance and rollback. Existing authentication requirements remain enforced.

Validation for this change: **217 passed, 0 failed, 2 skipped** in the default aggregate (frontend 24, API 166, CRMS 10, script tests 17). The two isolated database integration cases were previously executed separately and passed. Eight new readiness cases cover valid configuration/schema, missing/insecure/wrong-domain configuration, unrelated RP ID, development mode, incomplete schema and sanitized database errors. Deployment simulations cover the new readiness failure gate. TypeScript, targeted lint, syntax checks and both production/PWA builds passed. The checker returned `ready: true` against the existing local schema with process-local Marezi configuration and a read-only metadata query. This is not a production check; local development's empty database password correctly fails the separate production database configuration guard.

On the user's request to run checks through GitLab, the remote branch was fetched and confirmed behind the three existing local review commits, with no divergent remote work. GitLab Git read access and push dry-run succeeded; the stored credential's pipeline API request returned **HTTP 403**. Hosted results, deployment and physical enrollment remain unverified until remote evidence is available. No production account or schema was changed during this investigation.

## Production call background follow-up

The user's production background failure was reproduced on the actual Marezi page: its CSP rejects WebAssembly compilation. Public runtime/model assets are present with valid types/signatures; the document and API still send the old restrictive policy and an unversioned release. The repository policy already permits WebAssembly narrowly, so applying and verifying the correct production release is required. The exact running API/proxy source of the stale header remains pending host inspection.

Added content-versioned matching runtime/model assets, accurate background failure messages, real MediaPipe/loopback-WebRTC browser QA, and GitLab public-release diagnostics/deployment verification. Blur, preset/custom/Off, rotation, simulated camera replacement and blocked-policy recovery passed with original audio/source continuity. Both production builds and type checks passed. No `.env` or production data changes were made. Full details, evidence, pending physical/PWA acceptance and recovery steps: [Production background report](COMMUNICATION_PRODUCTION_BACKGROUND_20261112.md).

## Rollback and support

Revert this follow-up commit, reinstall the preceding package lockfiles, rebuild both frontends, and restart only `riana-cims` and `riana-cims-web`. No operational schema rollback is required. Keep data and backups intact. If a client list fails again, the dialog now shows Retry; inspect the sanitized API status and server error code rather than interpreting a failed fetch as zero clients.
