# Verified client sign-off, closure and completion documents

Updated 22 November 2026 (Africa/Nairobi).

## Result and root causes

The previous acceptance flow stored OTP/signature evidence but stopped at `client_accepted`, requiring another manual closure. Existing completion PDFs used request details alone and did not include that evidence. The Client Request Management report dialog did not select the responsible-manager confirmation mode. Developer loading states used an older SVG tile/bouncing-text component rather than the current CIMS loader artwork. Client SMS templates also duplicated the system name already carried by the sender.

Verified OTP or e-signature acceptance now inserts the acceptance, records feedback, accepts the report, creates the closure, updates the request to `closed_client_accepted` and records its closure audit in one transaction. Failure rolls these changes back together. Replay remains rejected; legacy manual close calls return an idempotent success for already closed work. Direct status PATCH cannot impersonate verified client acceptance/closure. A newer signed-off delivery resolves feedback on superseded report versions; unresolved feedback on the current report blocks closure.

An additional backed-up migration reconciles historical `client_accepted` records only when the latest report is accepted, declaration and verification evidence exist, a responsible manager exists, no closure exists and no correction/dispute remains unresolved. It preserves other states, acceptance evidence and existing completion dates, and adds closure/audit history. Repeating it does not duplicate records. It does not fabricate missing sign-offs or signatures.

The earlier feedback migration is also made portable: conditional information-schema checks and ordinary ADD COLUMN statements use the project's established delimiter/procedure pattern, avoiding MariaDB-only ADD COLUMN IF NOT EXISTS syntax. Both standard migration runners already support this delimiter format. Existing nullable columns and values are preserved on retries.

## Reports and application behavior

- The API generates a signed completion PDF after successful sign-off and returns it as an additive base64 response field. The client automatically downloads it and retains a Download Signed Completion Report button. Rendering failure does not reverse or disguise an already committed acceptance; the client can retry the download.
- E-signature reports embed the actual uploaded image, client name/designation, timestamp, declaration and verification reference. OTP reports explicitly identify verified OTP attestation and timestamp; they do not invent handwriting. Feedback, implementation details and report version are included.
- `GET /api/public/change-requests/review/:token/completion.pdf` requires the scoped, unexpired review token and an eligible accepted latest version. `GET /api/crms/change_requests/:id/completion.pdf` uses the existing authenticated request access checks. Responses are attachment PDFs with no-store caching. Missing signature evidence fails visibly rather than silently omitting it. Drafts, incomplete verification, newer unaccepted versions and unresolved disputes cannot produce a verified report.
- Signed PDFs are generated from stored acceptance/report evidence; this change does not introduce a separate archival file store or claim cryptographic PDF certification. The API declares and locks its own jspdf dependency so production generation does not rely on root development packages.
- Request Detail and Reports offer the signed report for accepted/closed requests. Legacy developer-completed requests keep their existing PDF path. Completion counts and overdue calculations include the closed lifecycle states.
- Prepare Completion Report is browser-tested opening its dialog and saving a draft; the responsible-manager path is separately tested through confirmation/notification dispatch. Client Request Management now passes the correct mode to the same dialog.

## Notifications and loader

Client request invitations, acknowledgments, completion confirmations and OTP SMS bodies no longer start with `RIANA CIMS:`. Other assignment/password SMS prefixes and the central verification-code prefix are also removed. Personal client messages start with Hello and the stored recipient name; security notices remain direct and actionable. Sender configuration, provider credentials, delivery logging, retries and email branding are preserved. Tests stub providers; no real client message is sent during QA.

Developer page and lazy-route loading use the same hook-free artwork component and CSS as CIMS's current loader. Each application retains its own React hooks to avoid mixing React installations; small action loaders remain compact. The main CIMS loading timing/branding behavior is preserved. Bundled logo resolution supports the standalone CRMS build.

## Validation and operational notes

- Disposable-schema integration covers duplicate confirmation, unrelated-manager denial, invalid OTP, replay, transactional feedback, automatic OTP/signature closure, signed PDF image inclusion, OTP attestation, invalid-token denial and historical reconciliation. Disputed, unverified and newer-version records remain open and cannot download a verified PDF. All notification providers are stubbed; the disposable schema is removed with a validated name.
- The portable feedback migration was run twice on fresh and partial disposable schemas using the production delimiter parser; historical feedback survives, history remains unique and helper routines are removed.
- Browser fixtures verify report preparation/draft save, manager confirmation, unrelated Sales visibility, OTP/e-signature feedback, two automatic PDF downloads, closed-state display, tracking refresh/recovery and original-link navigation. The generated two-page signature PDF was rendered with the existing PDF.js service and visually inspected; text and signature are readable without overlap.
- Final responsive matrix: 56 checks on five request/report/client surfaces plus seven current-loader checks. One initial short-orientation measurement was transient; it did not reproduce in a focused recheck. The QA runner now allows the same resize-settling interval for short orientations as regular widths, and the complete matrix passes without an application CSS workaround.
- Full build, TypeScript, regression, lint and dependency audit results are reported with the release. Native physical passkey hardware, live SMS/email delivery and native Android splash startup are separate from these local fixtures.

Deploy the API and frontend together through the existing GitLab main pipeline. Its verified-backup gate precedes the portable feedback migration and verified-signoff reconciliation; migration history and required columns are checked before the API restart. Confirm the exact deployed release SHA and served assets before calling production complete. Local browser/SQL success and a pushed commit alone do not prove deployment.

Rollback: restore the prior application release through the normal process, retaining feedback, acceptance and closure/audit evidence. Do not drop nullable feedback columns or reopen verified closed work indiscriminately. Any business decision to reopen a particular reconciled request should be explicit and audited. No login, tenant configuration, provider setting or credential cleanup is part of this release.
