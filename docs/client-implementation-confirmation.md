# Client implementation confirmation and feedback

Implemented and locally verified 2026-11-22 (Africa/Nairobi).

## Result and workflow

1. Development reaches `completed` or `ready_for_completion_report`.
2. The responsible Account Manager opens **Confirm Implementation**, records the implementation summary/solution and confirms dispatch. Existing administrative oversight remains available to SuperAdmin, Admin and Management. An unrelated Sales account cannot perform this action.
3. The existing email and SMS providers receive a completion message containing the secure review link and lifecycle tracking link. Delivery results are shown separately; failures are recorded and do not masquerade as confirmed delivery. **Resend Client Confirmation** reuses the current report/link rather than creating another version.
4. The client reviews the implementation and confirms with the existing OTP or signature-image workflow. Optional 1–5 feedback and up to 2000 characters of comments are stored in the same transaction as verified acceptance.
5. Feedback is visible on the client confirmation/tracking pages and to the responsible manager/administrators in request details. The manager can verify acceptance and close the request; closure is blocked before current client acceptance or while existing corrections/disputes remain unresolved.
6. The original submitted invitation link opens lifecycle tracking. Tracking refreshes every five seconds while visible, refreshes when the tab becomes visible, cancels in-flight work when leaving, avoids overlapping requests and retains the last successful result during temporary refresh failures. This is near-real-time polling, not an instantaneous server-push guarantee.

## Root causes corrected

Completion preparation/closure components were imported and state toggles existed, but the dialogs were not mounted in Request Detail. Client acceptance already existed, but feedback was not stored with it. Tracking exposed only a current stage, did not return the current review link/feedback, treated development completion as closure, and fetched only on load/manual refresh. A submitted invitation rendered an error instead of opening tracking.

## Security and consistency

- New authenticated `POST /api/crms/change_requests/:id/confirm-implementation` verifies ownership and completion status on the server. Existing report publication/dispatch and closure also enforce the responsible manager where one is assigned, with existing administrative oversight preserved.
- Request-row locking and transactional report creation make duplicate confirmation clicks return the existing result without another report or automatic notification pair. Provider calls happen after commit, outside the row lock. Explicit resend is a separate deliberate action; delivery after an ambiguous provider/network failure cannot be guaranteed exactly once.
- Existing review-token expiry, report versioning/supersession, OTP expiry/attempt controls, declaration, image validation and transactional replay protection remain intact. Accepted/superseded reports cannot be resent to reopen an accepted request.
- Feedback is validated server-side, parameterized in SQL and rendered as text. No password, session, tenant configuration, provider credential or media-processing changes were made.
- Public tracking uses the existing scoped bearer token, latest non-superseded report and safe stage projection; it does not expose account credentials or internal audit notes. Unpublished/expired review links are not returned. Tracking responses are not cached.

## Database and deployment

`server/migrations/20261122_client_implementation_feedback.sql` adds three nullable fields to `crms_client_acceptances`: `feedback_rating`, `feedback_comment`, `feedback_submitted_at`. Existing records, identifiers, relationships and indexes remain unchanged. No data migration or destructive update is required.

Before the local migration, the existing backup verifier produced a verified 98-table backup: `server/backups/backup_riana_cims_2026-11-21_21-14-13-367_a332c7dc.sql` (UTC filename; local date November 22). Only the new additive migration was applied locally and registered in migration history. Acceptance row count was unchanged.

For another environment, use its established backup/migration/release procedure and apply this migration before starting the updated API. No remote push or production deployment was performed here. Provider configuration and a client-accessible application origin must already be correct; localhost links are suitable for local tests only.

Rollback: restore the prior application release and retain the nullable feedback columns so collected feedback is preserved. Removing the columns would discard feedback and is not the recommended rollback. The verified backup provides a recovery point if a separate data restoration is required.

## Files and API compatibility

- `server/services/clientChangeRequests.js`: responsible-manager confirmation, transactional feedback, dispatch text/links, ownership and resend/closure safeguards.
- `server/services/clientRequestProgress.js`: safe lifecycle/stage projection with review/feedback state.
- `server/routes/crms.js`: confirmation action and manager-visible acceptance/report summary.
- `server/routes/clientChangeRequestPortal.js`: feedback forwarding and current tracking projection.
- `CRMS/src/pages/RequestDetail.tsx`, `PrepareCompletionReportDialog.tsx`, `useSupabaseData.ts`, `clientWorkflow.ts`: mounted dialogs, manager action, delivery retry, feedback and additive types.
- `src/pages/ClientCompletionReview.tsx`, `ClientRequestTracking.tsx`, `ClientChangeRequestForm.tsx`: verified feedback entry/display, automatic tracking and original-link navigation.

Existing acceptance endpoints remain backward-compatible: omitting feedback retains the prior behavior. Existing completion-report endpoints remain available under the applicable ownership checks. Existing legacy completed requests preserve their closed tracking state; client-originated completed requests await manager/client confirmation.

## Validation and limits

- Full regression suite: 26 frontend, 177 backend, 14 CRMS and 19 script tests passed; 2 existing isolated hardware/MySQL tests were skipped. Loopback HTTP tests require local network access and passed outside the restricted network sandbox.
- A separate disposable-schema integration test cloned schema definitions, seeded synthetic records and used real MariaDB transactions. It verified concurrent duplicate confirmation, authorization denial, one report/email/SMS pair, bad OTP rejection, OTP acceptance with feedback, replay rejection, signature acceptance with feedback, closure gating and original-link tracking through closed/feedback states. All providers were stubbed and the disposable schema was removed.
- Browser fixture tests exercised the manager action/dialog, unrelated Sales visibility, OTP/signature feedback submission, automatic tracking updates, transient refresh resilience and original submitted-link navigation. The test harness reuses its React root under Vite reloads; the observed multiple-root exception was a harness defect, not an application workaround.
- The three workflow pages passed 48 responsive viewport/orientation checks. The broader responsiveness report records 978 primary checks and additional stress/empty/touch coverage.
- CIMS/CRMS builds, TypeScript and focused lint passed. Existing source warnings remain documented; no lint errors were introduced.
- No live client email or SMS was sent during validation. Provider acceptance/delivery, physical client devices and remote production reachability are not certified by fixture or isolated-database tests.

Reproduce the focused verification with `node scripts/qa/client-implementation-integration.cjs` (local DB privileges required) and `node scripts/qa/client-implementation-browser.cjs` (existing local Vite server required). Results are under `docs/evidence/client-implementation/`.
