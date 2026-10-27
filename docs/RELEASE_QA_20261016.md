# Release Verification - 16 October 2026

## Scope And Changes

Scheduling completion update: see `SCHEDULING.md` for the architecture audit,
field classification/dependency map, implemented behavior, explicit remaining
master-brief work, new migration/API contracts and rollback steps. The SWC plugin
was replaced by supported React plugins in both applications and Developers tests.
New timed scheduling and server-clock browser/concurrency tests are included.

Current cumulative inventory release, CIMS and Developers production builds,
hosting overlays and aligned live SQL. No cloud deployment or remote database
execution is performed. Inventory Officers retain subsidiary-scoped access.

Reports now expose in-stock, out/issued, faulty, maintenance, returned, generated
and ready-to-assign totals, drill-downs and summary CSV. Raw lifecycle totals are
separate from eligibility so missing/unverified stock is not represented as usable.
No new reporting schema or historical data rewrite is needed.

Shared CIMS requests/private files and Developers data hooks use actionable
generic server/network messages. Business validation and maintenance messages
are retained; SQL details are not displayed. Default destructive notices remain
visible for 12 seconds. Writes are not automatically retried.

## Verification Matrix

| Area | Verification |
| --- | --- |
| Backend regression | `npm --prefix server test`: 86 passed, two opt-in database integrations separately enabled |
| Request messages | `node --test scripts/request-errors.test.cjs`: two passed |
| Database integration | Separately enabled `hardwareMySql.test.js` on a fresh isolated local database passed |
| Inventory scope | Officer scope, cross-subsidiary denial, report totals and lifecycle drill-down assertions passed |
| Documents | Authenticated image load/retry/preview/download, duplicate capture/list suppression, cross-scope denial |
| Stocktake | Preview, identity matching, missing confirmation, stale rejection, readable result and CSV |
| Equipment | Configurable custom labels/types, add/edit/reopen, quantities, serial search/selection and handover rows |
| Variants | Create/edit/delete, dependency restriction and permissions |
| Dates | Newly past future-facing dates rejected; historical values preserved |
| Browser | Playwright; Browser plugin unavailable. Desktop, tablet, mobile, narrow mobile and light/dark inventory coverage |
| Reporting | Officer totals/drill-downs and CSV verified at 1440x900 and 390x900 |
| Error states | 403, 404, 409, 429, 500, disconnected write, private-file failure and Developers failure |
| Cache | Isolated one-time RIANA/workbox cleanup retained unrelated caches and login storage |
| Local smoke | Actual login rendered, expected title, no framework overlay/page errors and API health 200 |
| Unified database | CIMS/Developers share riana_cims; required tables/roles verified, no detected client/assignee orphans |
| Build | CIMS and Developers production builds passed |
| Typechecks | Both application typechecks pass; Finance currency state and Chat post-await RTC state annotations corrected |
| Finance regression | USD-to-EUR edit/save/reload verified at 1366x900 and 390x844 with fixture APIs |
| RTC state regression | Native browser offer/answer transitions verified; not a live call transport test |
| External storage | 25 existing files copied and SHA-256 verified outside the application; both active supporting documents match database checksums |
| Server-authoritative scheduling | Device clock changes ignored, midnight rollover updated minimums, offline inputs fail closed |
| New booking engine | Concurrency, adjacent bookings, policy/calendar rules, DST, scope, versions, recurrence, history and in-app job suppression passed |
| New UI | Desktop/light and mobile/dark scheduling, persistent errors, stable retry keys, rescheduling and scoped CSV passed |
| Developers unit tests | Seven tests passed after React plugin migration |
| Calendar range regression | Two tests cover single-day and cross-month legacy assignments |

The final completion checks reran the backend suite, both isolated database integrations,
request-message tests and both typechecks. Finance and native RTC state regressions
are exercised by `scripts/typecheck-regressions-qa.cjs`; other inventory/browser
coverage above was exercised during this cumulative release's preceding QA pass.

Database integration covers issuance concurrency/idempotency, approval, assignment,
installation selection, transfers, reconciliation, variant safety, handover image
capture, supporting-file access and migration compatibility. Browser fixture APIs
do not write customer records. Backend notifications are tested with controlled
providers, not real customer delivery.

The release verifier applies `LIVE_DB_UPDATE.sql` twice against an isolated
database, checks records/custom roles/defaults and validates packaged hashes.
Use the single consolidated ZIP in `release/`; its embedded manifest identifies
the exact build and every packaged checksum. Superseded releases and generated
staging copies are removed only after the new archive and SQL are verified.

## Warnings And Limits

- This is not a claim that every system feature or every external integration has
  been manually exercised. Full Finance workflows, real-time calls, actual SMTP/SMS/WhatsApp,
  cloud Passenger/routing/TLS and real cloud upload paths need deployment/UAT checks.
- Prior Chat RTC signaling-state and Finance currency-state type diagnostics are
  resolved with type-only annotations; no call or accounting workflow was changed.
- The SWC recommendation is resolved by switching plugins, not suppressing it.
  Existing unrelated PostCSS/tooling advisories may remain; see SCHEDULING.md.
- Local external-storage verification now passes. The approved data directory is
  `D:\riana-cims-data`, with separate private_uploads, legacy_uploads and file_backups
  folders. Copies were verified before configuration switched, all originals remain
  for rollback, and no database references were rewritten. Cloud storage still needs
  its own paths/access checks; do not deploy Windows paths to the cloud.
- Summary groups overlap (Returned is included in In stock; Ready to assign is a
  subset of Available). Only complete lifecycle-status totals sum to Registered.
  These are current states, not physical certification or historical-as-of balances.

## Deployment And Rollback

Use only the latest timestamped consolidated ZIP and its LIVE_DB_UPDATE.sql.
`hosting/Mysql_host/riana_cims_host.sql` was refreshed separately for clean installs;
it is destructive and must never replace an existing live database.
Back up the live database/application/uploads. Preserve live secrets, routing,
startup wrapper and external storage. Follow DEPLOYMENT.md and repeat local smoke,
officer reporting, authenticated document and installation checks on cloud.

For rollback, restore prior application assets/dependency manifests while retaining
additive schema, serial counters, variant tombstones, assignments, audit/file records
and uploads. Do not use destructive hardware rollback SQL after records exist.

For local storage rollback, stop upload writers, reconcile any newly uploaded
external files before switching back, then restore the saved local environment
under `.runtime/backups` and restart CIMS. Retained old files alone do not contain
uploads created after the switch. Keep the external data and audit manifests.
