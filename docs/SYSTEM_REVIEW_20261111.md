# System review and remediation — 11 November 2026

**Follow-up:** [12 November closure and client-request repair](SYSTEM_REVIEW_20261112.md) supersedes the dependency, isolated-database and attachment acceptance gaps below. The older results are retained as the original audit record.

## Outcome and scope

Reviewed the existing uncommitted deployment changes and inventoried 478 files across the main frontend, API, CRMS frontend and scripts. Reviewed affected calling, client-request, authentication, packaging and deployment paths; ran repository-wide type/lint/build checks and the aggregated test suites. This is a code and local runtime review, not certification that every business workflow has passed production acceptance.

Starting revision: `4a3129b` on `main`. The initial uncommitted files were `.gitlab-ci.yml` and `server/scripts/deploy-production.sh`. Those changes were reviewed and corrected as part of this revision. No remote push or production deployment was requested or performed.

## Findings and implemented repairs

| Area | Root cause | Result |
| --- | --- | --- |
| Calling | Terminal events for another call cleared the active meeting; losing devices could reopen a call from a follow-up event | Call-ID-scoped lifecycle handling, device-resolution suppression, and regression coverage |
| Call media | Conversation selection was a dependency of media teardown | Switching colleagues preserves meeting media; unmount still tears it down |
| Invitations | Terminal call snapshots could retain ringing participant state | Terminal updates dismiss the matching invitation |
| Frontend lint | Redundant boolean casts | Equivalent toggles now pass lint |
| CRMS type contracts | New request lifecycle fields/statuses and existing client contacts diverged from shared types | Shared types, badges and contact mapping aligned with existing API behavior |
| CRMS incomplete controls | Export/sort/pagination/edit actions were placeholders | Request CSV export, natural ticket sorting, 25-row pagination, permitted edit navigation and retry are implemented; unsupported inert Cancel action removed |
| Reports | Header export controls did not invoke filtered exports | PDF/CSV exports use filtered report data; CSV formula prefixes are escaped |
| Completion reports | Route passed flat arguments to a service expecting `data`; dispatch was not called | Draft/save/send contract corrected and actual SMS/email delivery outcomes displayed |
| Client-request access | Sensitive actions lacked per-record ownership checks | Invitation, completion and closure actions check ownership/authorized roles |
| Public portal | Raw internal failures escaped; invalid uploads could be written before token checks | Generic internal errors, prevalidation and failed-request upload cleanup |
| Acceptance | Expiry/lifecycle/declaration checks were inconsistent; acceptance and OTP updates were not atomic | Expiry/lifecycle guards and transactional, row-locked acceptance with rollback/replay tests |
| Content validation | Optional scope sentinel values and completion attachments lacked normalization | Optional IDs normalized; attachment count/content/size validated; interpolated notification HTML escaped |
| Session parsing | Malformed cookie encoding could throw | Invalid cookie values no longer break unrelated cookies |
| Fetch authentication | URL substring matching could attach a bearer token to another origin | Credentials attach only to same-origin `/api/crms` or its child paths; regression test added |
| Standalone CRMS | Entry guard ignored effective module role and rejected supported account managers | Entry uses effective CRMS role; API remains the authorization authority |
| Standalone API | Four production imports resolved accidentally through root dependencies | API declares `qrcode`, `otpauth`, `@simplewebauthn/server`, and `web-push`; closure regression added |
| Dependencies | API and CRMS lockfiles contained known advisories | Targeted dependency updates; final production audits report zero in all three packages |
| Deployment | Failures were swallowed, arbitrary port owners killed, multiple PM2 owners/unmanaged fallbacks attempted, diagnostics published under `dist` | Fail-fast locked install, verified backup before migrations, one PM2 owner, private release marker, exact release/icon verification, no arbitrary process killing or public diagnostic dumps |
| CI | Default API test command omitted `.cjs` suites; build did not establish broad validation | Aggregated tests and type/lint/audit/build gates in GitHub/GitLab; production deployment manual and serialized |

Deployment now requires a full commit SHA. The private `.runtime/app-release` marker supplies the release to root-owned PM2 without relying on sudo environment forwarding. The default production PM2 binary/owner remains the existing root installation; `DEPLOY_PM2_MODE=user` and `DEPLOY_PM2_BIN` support explicitly configured user-owned installations. CI requires a trusted `CX_SERVER_HOST_KEY` known-host entry including the non-default SSH port. Host verification follows [GitLab SSH guidance](https://docs.gitlab.com/ci/jobs/ssh_keys/); deployment serialization follows [GitLab resource groups](https://docs.gitlab.com/ci/resource_groups/).

## Verification

| Check | Evidence |
| --- | --- |
| Main frontend tests | 21 passed |
| API tests | 154 passed; 2 isolated-MySQL integration tests skipped |
| CRMS tests | 10 passed, including token-origin and CSV/filter regressions |
| Script tests | 16 passed, including 12 isolated deployment/manifest checks |
| Total | 201 passed, 2 skipped, zero failures |
| TypeScript | Main application, Vite config and CRMS checks passed |
| Lint | Zero errors; repository-wide 381 warnings, including 7 CRMS fast-refresh warnings |
| Production builds | CIMS and CRMS passed; CIMS production marker verification and PWA generation passed |
| Production dependencies | Root 0, API 0, CRMS 0 reported advisories |
| Configuration | Both CI YAML files parsed locally; `git diff --check` passed |
| Local database | Read-only metadata: 98 InnoDB tables, 34 recorded migrations, including meeting state, recordings and client-request portal |
| Services | PM2 restarted only `riana-cims` and `riana-cims-web`; API `http://127.0.0.1:8081/api/health` and web `http://127.0.0.1:8090/` returned 200 |
| Browser identity/rendering | Correct title and meaningful login content at 1440px and 390px; no Vite overlay or horizontal overflow |
| Browser interaction | Forgot-password control opens the reset dialog at both widths; zero page errors; no reset request submitted |

Browser plugin was unavailable, so installed Playwright/Chromium was used in isolated contexts. Screenshots: initial login captures in `%TEMP%/riana-system-qa-bgzJ4s`; final interaction captures in `%TEMP%/riana-verified-ui-3YK6cz`. An initial interaction attempt during cache refresh timed out; repeating after the managed Vite restart passed. Browser caches regenerated normally on startup. Local health currently reports `unversioned`, so it proves local availability rather than a deployed commit identity.

## Cleanup and data preservation

Removed 80,196,403 bytes (approximately 76.5 MiB) of verified generated/rebuildable output: stale `release`, `Deployment`, `Deployment-packages`, temporary QA output under `tmp`, Vite/cache directories, TypeScript build metadata, and a failed advisory-plan scratch file. Current rebuilt `dist` and `CRMS/dist` are retained. Generated cache/build metadata is ignored by Git.

Preserved `.env` files, database backups, `.runtime/backups`, server runtime secrets, uploads/private uploads, logs, source SQL/migrations, recovery scripts and before/after snapshots under `server/tmp`. No database repair, import, migration, cleanup, or operational record deletion was executed. MySQL and unrelated POS services were not restarted.

## Remaining acceptance work and risks

- The two isolated MySQL concurrency suites require a disposable database. Metadata inspection does not establish full relational integrity, migration rollback safety or data completeness.
- Full authenticated role/tenant/subsidiary regression, physical two-device media, camera/microphone permissions, TURN/SFU capacity, and real-provider delivery still require staging/test accounts and infrastructure. No messages were sent to real recipients in QA.
- Completion attachments are validated/stored using the existing inline payload contract; a complete client download/attachment lifecycle still needs dedicated acceptance review.
- Existing lint warnings remain maintainability debt. Production-only audits are clean. The full CRMS audit still reports 17 development-tool advisories (12 moderate, 3 high, 2 critical), including Vite/Vitest and their dependency chains. Resolving these requires a separately validated development-toolchain migration; do not expose development/test servers to untrusted networks. This review does not claim a clean development dependency audit.
- Existing hardware workflow and durable notification-worker roadmap items are not automatically complete because compilation passes. Prior acceptance documents remain applicable where they require database, device, provider or product decisions.
- CI YAML was parsed locally; no hosted pipeline or Docker image build was executed. The new manual deployment path and sudo/host-key configuration require staging verification before production use. Advisory SAST/license jobs retain their existing non-blocking policy.
- Targeted major updates to Nodemailer 10, React Router 7 and Zod 4 passed local tests/builds; SMTP delivery and all authenticated navigation still require staging acceptance.

## Rollback and operational guidance

Revert this review commit to restore the previous source and lockfiles; reinstall locked dependencies and rebuild both frontends, then restart only the two Riana PM2 services. No schema rollback is needed for this review because no migrations were applied. Retain existing data, secrets and backups. Generated packaging can be rebuilt with the existing packaging scripts after separate release validation.

Run `npm.cmd test`, `npm.cmd run typecheck`, both lint commands and `npm.cmd run build:all` for local validation. Use `node node_modules/pm2/bin/pm2 restart ecosystem.config.cjs --only riana-cims,riana-cims-web --update-env` for the local managed services, then check HTTP health. Production deployment uses the manual GitLab job and the full release SHA, not this local restart command.
