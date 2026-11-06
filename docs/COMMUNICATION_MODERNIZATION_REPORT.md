# RIANA CIMS Communication Modernization Report

Date: 2026-10-31

## Authoritative current status — 2026-11-01

This section is the release-status source of truth. The dated sections below are retained as an implementation history; where an older statement conflicts with this section, this section supersedes it.

| Capability | Current status | Remaining release evidence |
|---|---|---|
| Participant-specific media, mute/camera/screen-share controls, device selection/test/fallback, and playback recovery | Implemented and locally compile/lint/test verified | Two physical-device audio/video, permissions, device switching, echo, autoplay, and screen-share acceptance |
| Persistent calls across internal navigation and compact call controls | Implemented and locally build/test verified | Physical navigation and network-recovery acceptance |
| Gallery/speaker layouts and browser active-speaker detection | Implemented and locally build/test verified | Acoustic and multi-participant physical acceptance; future SFU events |
| Atomic winning-device acceptance and device-owned signaling | Implemented; communication migration applied locally | Staging migration verification and two-device race/cancellation tests |
| Web Push registration, renewal, delivery service, service-worker handling, and click routing | Implemented and locally tested with mocked delivery | Staging VAPID configuration and browser/OS background-delivery tests |
| Per-user retention, saved messages, legal holds, visibility, and dry-run worker | Implemented; communication migration applied locally | Staging data-preservation/rollback checks and policy-approved dry-run review |
| Passkeys, session review/revocation, password/MFA hardening | Implemented; account-security migration applied locally | HTTPS staging-origin and physical authenticator acceptance |
| Production group conferencing | Infrastructure-dependent | Authenticated SFU/TURN deployment, capacity testing, host-control acceptance, and operational monitoring |

Local migration history confirms `20261031_communication_backend_foundation` and `20261101_passkeys_and_account_security` were applied to the local development database only. Neither migration is claimed as applied or verified in staging or production.

Current release decision: **Not production-ready.** The remaining gates are staging database migration/rollback evidence, physical-device media/passkey/push acceptance, authenticated role and subsidiary-isolation regression, and operational SFU/TURN evidence. No production deployment or migration is authorized by this report.

The media-device completion adds permission-aware microphone/camera/speaker enumeration, microphone level testing, in-call input-track replacement without recreating peer connections, browser-supported output routing, device-change refresh, and default-device fallback after an unexpected input disconnect. TypeScript, targeted ESLint, and all 11 communication tests pass. Browser/OS device behavior remains a physical acceptance gate.

## Historical implementation record

## Executive status

The critical code path that collapsed every WebRTC participant into one remote media stream has been repaired. Remote media is now keyed by participant and rendered as an independent tile. Microphone capture now requests browser-supported acoustic echo cancellation, noise suppression, automatic gain control, and mono audio.

This change is a bounded Phase 2 repair. It does not make the current peer-to-peer group topology a production SFU, does not create closed-browser Web Push delivery, and does not apply a message-retention migration. Those items require infrastructure, schema, operational-policy, and real-device validation before release.

## Validation results

Validation was rerun on 2026-10-31 through an authorized process path outside the restricted command host.

| Check | Result |
|---|---|
| Complete CIMS + CRMS production build | Passed: CIMS transformed 6,167 modules; CRMS transformed 3,256 modules; both production builds completed successfully. |
| PWA generation | Passed: `manifest.webmanifest`, `registerSW.js`, `sw.js`, and Workbox output were generated; 105 entries were precached. |
| TypeScript `tsc --noEmit` | Passed with zero errors. |
| Targeted ESLint (`ChatModule.tsx`, `useChat.ts`) | Passed with zero errors and four hook dependency warnings in `ChatModule.tsx`. |
| `git diff --check` | Passed. |
| Physical two-device call test | Not executed; remains blocked pending two devices and non-production accounts. |

### Validation-blocker root cause

The restricted command process intermittently failed before process creation with Windows `CryptUnprotectData` error `2148073483`. Read-only Git and PowerShell commands could still run, while Node/npm launches repeatedly failed. Running the same validation through an approved external process path succeeded. This demonstrates that the blocker originated in the development-tool process/credential-protection boundary rather than application source, npm dependencies, or production secrets. No credential was changed, exported, bypassed, or weakened. PowerShell's script policy separately blocked `npm.ps1`; executing the standard npm command through `cmd.exe` avoided that shell-specific wrapper while preserving system policy.

## Existing-system audit

### Frontend and WebRTC

- `ChatModule.tsx` owns media acquisition, peer connections, signaling consumption, and the active-call UI.
- A peer connection is created per target user, but every `ontrack` handler previously wrote to one `remoteStream` state value and one video/audio element. The last remote track therefore replaced the preceding participant in the UI.
- The local preview is muted, which prevents deliberate local microphone playback.
- Track publication checks sender track IDs and avoids adding the same local track twice to one peer.
- ICE uses a single public STUN server. No TURN configuration, short-lived TURN credential service, SFU, adaptive subscription, or media-quality telemetry was found.
- Group calls currently create one peer connection per participant: a mesh topology. This is not suitable for unbounded production group meetings.
- Media state is component-local. Navigation or component unmount can end the call, so application-wide persistent calls are not yet implemented.

### Signaling and backend

- Authenticated HTTP endpoints create calls, update status, exchange signals, retrieve missed calls, and stream communication events.
- Call and participant identifiers are represented in `messages` and `call_participants`.
- Server-side call participant membership checks exist around signaling and call retrieval.
- The current state model covers ringing, accepted, declined, missed, and ended, but not the complete initiating/connecting/reconnecting/busy/canceled/failed lifecycle.
- Signaling is application-hosted event streaming rather than a dedicated persistent real-time/SFU service.

### Initial messaging and persistence baseline

- Existing messaging supports one-to-one messages, attachments, replies, reactions, editing, per-user deletion, deletion for everyone, read state, typing, and missed calls.
- The initial audited schema was message-centric and did not provide the complete per-participant retention, saved-message, archive, legal-hold, and cleanup-job model required by the approved retention policy. The additive foundation and guarded retention worker described below close the locally implementable portion of that gap; migration acceptance remains a staging gate.

### Initial PWA and notifications baseline

- A service-worker registration path and browser Notification permission hook exist.
- The Vite PWA configuration already provides a branded installable manifest, standalone display, application shortcuts, auto-updating generated service worker, sensitive API `NetworkOnly` handling, cache cleanup, and explicit navigation exclusions for API, developer, and upload paths.
- The production build successfully generated the PWA manifest and service-worker assets.
- The initial hook requested browser permission only; push-subscription persistence, VAPID delivery, deduplication, expired-subscription cleanup, and multi-device invitation cancellation were subsequently implemented as documented below. Browser-closed delivery still requires configured staging VAPID credentials and physical browser/OS acceptance.

## Confirmed root causes

1. **Only one participant video:** all remote peers overwrote the same React state value and shared the same media element.
2. **Application-induced echo risk:** capture used `{ audio: true }`, leaving audio-processing constraints implicit. A shared remote playback element also made participant routing ambiguous.
3. **Unreliable calls outside the active app:** foreground event streaming and ringtone behavior cannot substitute for a backend Web Push delivery pipeline.
4. **Group scalability:** the current N-to-N peer mesh consumes upload bandwidth and CPU per participant; it must not be described as a scalable meeting implementation.
5. **Retention gap:** no per-user visibility/retention metadata and no safe scheduled cleanup pipeline were found.

## Changes implemented

- Replaced the singleton remote stream with a participant-keyed stream registry.
- Added an independent remote media component and tile for every invited participant.
- Deduplicated tracks added to participant streams.
- Kept the local video preview muted.
- Requested echo cancellation, noise suppression, automatic gain control, and mono capture.
- Added conservative 720p/24 fps ideal video constraints with a 30 fps maximum.
- Preserved existing API contracts, signaling endpoints, schema, authentication, permissions, and message workflows.
- Made call participant state transitions transactional with message and participant row locks.
- Added idempotent repeated acceptance and rejection of acceptance after a terminal call state.
- Added server-side participant authorization and audit logging to call-state transitions.
- Preserved user-level event fan-out so all open sessions receive the authoritative resolved call state.
- Added, but did not apply, the additive `20261031_communication_backend_foundation.sql` migration for communication preferences, push subscriptions, notification deduplication, per-user message visibility, saved messages, and legal holds.
- Added accessible in-call microphone mute, camera enable/disable, and screen-share controls.
- Screen sharing replaces the outbound video sender track without republishing local audio, restores the camera track on stop, responds to browser source termination, and releases display media during teardown.
- Extended the unapplied migration with stable device identifiers and call-device session records for future winning-session attribution.
- Added authenticated communication-preference APIs for history preservation, notification categories, DND, quiet hours, and timezone.
- Added device-owned Web Push subscription registration/renewal and soft removal APIs with HTTPS endpoint validation and endpoint hashing.
- Added ownership-checked save/unsave and saved-message retrieval APIs.
- Added transactional per-user archive, unarchive, and clear-history visibility operations that do not delete another participant's history.
- Added explicit `COMMUNICATION_MIGRATION_REQUIRED` responses so deployment order failures are diagnosable without weakening access controls.

## Phase 5 API inventory

All endpoints require the existing authenticated CIMS session.

| Method and route | Purpose |
|---|---|
| `GET /api/communication/preferences` | Read personal retention and notification preferences. |
| `PUT /api/communication/preferences` | Update Keep History, notification categories, DND, quiet hours, and timezone. |
| `PUT /api/communication/push-subscriptions` | Register or renew the authenticated user's device-specific HTTPS push subscription. |
| `DELETE /api/communication/push-subscriptions/:deviceId` | Soft-disable only the authenticated user's matching device subscription. |
| `PUT /api/chat/messages/:messageId/saved` | Save an accessible message for the authenticated user. |
| `DELETE /api/chat/messages/:messageId/saved` | Unsave the authenticated user's saved-message record. |
| `GET /api/chat/saved-messages` | Retrieve accessible messages saved by the authenticated user. |
| `POST /api/chat/conversations/:otherUserId/visibility` | Archive, unarchive, or clear only the authenticated user's conversation visibility. |

The APIs are implemented but cannot be runtime-tested until the additive migration is applied to a disposable environment. External Web Push delivery remains disabled until VAPID configuration and a delivery adapter are provisioned.

## Phase 6 retention worker

Implemented files:

- `server/services/messageRetention.js`
- `server/scripts/run-message-retention.cjs`
- `server/tests/messageRetention.test.cjs`

The worker uses rolling age eligibility and per-user visibility. It excludes users with Keep History, individually saved messages, messages under an active legal hold, and visibility rows already hidden. Group call participants are evaluated independently. Execution writes only `message_user_visibility.hidden_at`; it does not delete message content, audit records, search data, or attachments.

Dry-run is the default. A write requires both:

1. `COMMUNICATION_RETENTION_EXECUTION_ENABLED=true`
2. the explicit `--execute` command argument

The ordinary command `npm run communication:retention:dry-run` supplies neither and cannot write. Batch size and retention days are bounded through `COMMUNICATION_RETENTION_BATCH_SIZE` and `COMMUNICATION_RETENTION_DAYS`.

Automated retention tests passed: 5 tests covering default dry-run, dual execution authorization, Keep History/saved/legal-hold eligibility guards, no-write dry-run behavior, and transactional per-user visibility writes.

No disposable MySQL-compatible engine or Docker runtime was available in this development environment, so the migration itself was not executed. Foreign-key compatibility, index creation, repeat execution, and existing-data preservation remain staging gates rather than claimed passes.

## Phase 7 Web Push adapter

Implemented `server/services/webPushDelivery.js` with the standards-compliant `web-push` transport. The adapter validates VAPID configuration, retrieves only active device subscriptions, enforces global/category notification preferences, DND and timezone-aware quiet hours, claims a per-device deduplication record before delivery, returns structured counts, and disables subscriptions that return HTTP 404 or 410. Payloads contain only bounded notification metadata and internal relative routes; raw message content, tokens, and private subscription material are never included.

New-message and incoming-call events invoke push delivery asynchronously after their primary database work and foreground event fan-out. A push outage cannot roll back or delay the message/call API response. Delivery remains fail-closed until the additive migration and all VAPID variables are present.

Required environment:

- `VAPID_SUBJECT`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`

Mocked adapter tests cover VAPID fail-closed behavior, DND/category suppression, overnight quiet hours, payload minimization, device deduplication, successful delivery accounting, and expired-subscription cleanup. Actual browser/OS background delivery remains unverified pending staging credentials and physical devices.

The final 2026-11-03 production dependency audit (`npm audit --omit=dev`) reported zero vulnerabilities. No force audit fix was used.

## Final consolidation update — 2026-11-01

### Architecture

```text
Authenticated CIMS browser/PWA
  ├─ HTTPS API + authenticated event stream ──> CIMS application server
  │    ├─ transactional call/message state ───> MySQL-compatible database
  │    ├─ privacy-bounded Web Push ───────────> browser push services
  │    └─ future short-lived media tokens ───> dedicated SFU/TURN tier
  └─ WebRTC media
       ├─ current one-to-one / bounded mesh ──> authorized peers
       └─ planned production groups ──────────> SFU (infrastructure-dependent)
```

The CIMS server remains authoritative for identity, membership, call state, device ownership, retention, notification policy, and audits. Device identifiers never grant authority; authenticated sessions and participant membership remain mandatory.

### Device-winning acceptance

- The browser creates one stable, non-secret device identifier and supplies it when creating, answering, and signaling calls.
- Call creation records the caller device and creates ringing invitations for active registered recipient devices.
- Acceptance locks both call and device-session records. The first valid device wins; sibling ringing sessions become canceled in the same transaction.
- Repeat acceptance by the winning device is idempotent. A different device receives `CALL_ACCEPTED_ON_ANOTHER_DEVICE`.
- A `call_device_resolved` event is broadcast to all sessions for the user; losing browser sessions stop ringing and clear call signals.
- Signaling is rejected with `CALL_DEVICE_NOT_AUTHORIZED` unless the authenticated participant's current device owns an accepted device session.

This is implemented and compile-verified but remains runtime-unverified until the additive migration is exercised in staging with two physical devices.

### Browser Web Push completion

- Authenticated clients retrieve only the public VAPID key.
- Permission approval creates or renews a PushManager subscription tied to the stable device ID.
- Removal unsubscribes the browser and soft-disables the server record.
- The generated service worker imports `push-handlers.js`, displays bounded notifications, deduplicates by notification tag, and focuses or opens an internal CIMS route on click.
- Private VAPID material remains server-only. Browser/OS delivery remains a physical-device staging test.

### React lifecycle findings

The four hook dependency warnings were resolved without adding unstable WebRTC functions to dependency arrays. Ringtone and teardown effects now depend on derived scalar state, while teardown and peer-creation effects dereference the latest implementation through stable refs. This avoids stale closures without triggering media teardown, duplicate signaling listeners, or reconnection loops.

### Dependency security assessment

`npm audit` reported 30 findings across the complete 947-package tree: 2 low, 22 moderate, 6 high, and 0 critical. `npm audit --omit=dev` reported **zero production dependency vulnerabilities**.

The high findings are confined to development/operations tooling chains (`pm2` → `@pm2/agent`/proxy packages and PM2's `js-yaml`). The offered PM2 fix is a major upgrade to 7.1.1. Moderate findings also affect lint/build/PWA tooling, and proposed fixes include major or backwards-version changes. No forced audit remediation was applied because these packages are not shipped in the browser/server production dependency set and a major PM2 change requires isolated process-management, startup, logging, and restart testing. Residual risk: operators running the repository's development PM2 package should restrict untrusted configuration/input and schedule the isolated upgrade before the next deployment-tooling refresh.

### Staging sequence

1. Back up staging and restore it into an isolated disposable database.
2. Apply prior migrations, then `20261031_communication_backend_foundation.sql`; rerun it to verify intended repeat behavior.
3. Validate foreign keys, unique indexes, existing row counts, and API query compatibility.
4. Deploy the candidate application with retention execution disabled.
5. Configure staging VAPID variables and register two non-production devices.
6. Test winning-device acceptance, losing-device cancellation, late rejection, signaling ownership, logout, and reconnect.
7. Run message/incoming/missed push tests and notification-click routing.
8. Run retention dry-run; compare candidate rows to policy expectations before any approved staging write.
9. Provision and capacity-test the SFU/TURN tier before enabling production-scale group calls.
10. Complete the physical-device checklist and regression suite before release approval.

### Production readiness decision

**Not production-ready for the complete enterprise communication scope.** The code-level device-winning, push, retention, media-control, and PWA foundations are implemented, but migration execution, physical-device WebRTC/push acceptance, persistent calls across navigation, SFU/TURN provisioning, group capacity testing, and full staging security verification remain release gates.

### Final validation results

| Check | Result |
|---|---|
| Backend syntax | Passed. |
| TypeScript | Passed with zero errors. |
| Targeted communication ESLint | Passed with zero warnings and zero errors; the prior four lifecycle warnings are resolved. |
| Communication tests | 11 passed, 0 failed. |
| CIMS production build | Passed; 6,168 modules transformed and bundle verification passed. |
| CRMS production build | Passed; 3,256 modules transformed. |
| PWA generation | Passed; 107 entries precached. Generated `sw.js` imports `push-handlers.js`. |
| Production dependency audit | Passed with zero findings using `npm audit --omit=dev`. |
| Complete dependency audit | 30 development/operations-tooling findings remain; 0 critical. |
| Git whitespace validation | Passed. |
| Migration execution | Blocked: no disposable MySQL-compatible engine or Docker runtime available. |
| Physical-device acceptance | Not executed. |

## Release-closure implementation — 2026-11-01

### Persistent calls across internal navigation

The audit confirmed that `useChat` is already owned by the authenticated global `Header`, outside the module-content switch. A new provider would duplicate the existing event stream and state owner. The remaining defect was conditional unmounting of `ChatModule` whenever its panel closed.

The media controller now remains mounted off-screen while a call is active, so peer connections, media tracks, screen sharing, signaling state, and call controls survive internal CIMS module navigation. A compact global panel provides an accurate call timer, microphone toggle, camera toggle, return-to-call action, and hang-up. Logout or authenticated-shell unmount still triggers the existing teardown and releases all tracks and peer connections.

Status: **Implemented and build-verified; physical navigation/call acceptance remains pending.**

### Active-speaker and layouts

Current peer calls use a bounded browser fallback: one Web Audio analyser per live remote audio stream, 256-sample windows, and a 350 ms interval. A participant must exceed a noise floor before becoming active. The UI provides Gallery and Speaker modes, stable highlighting, participant labels, and camera-off/waiting placeholders. Speaker mode enlarges the active tile without hiding other participants or continuously rearranging the grid. The state shape can be replaced by authoritative SFU speaker events when the production media tier is introduced.

Status: **Implemented and compile/lint-verified; acoustic and multi-participant verification remains pending.**

### Migration and staging acceptance

`docs/COMMUNICATION_STAGING_ACCEPTANCE.md` provides reproducible disposable-database environment variables, migration sequencing, preservation/integrity checks, API compatibility checks, dry-run retention verification, SFU/TURN requirements, capacity measurements, and rollback steps. No compatible disposable database is available locally, so migration execution remains **Blocked**, not passed.

The physical checklist now covers call persistence, compact controls, winning/losing devices, signal ownership, background push, click routing, active-speaker layouts, screen sharing, reconnection, and SFU acceptance. Every unexecuted physical item remains explicitly **Pending**.

### SFU/TURN readiness

LiveKit remains the recommended initial SFU because it provides short-lived room tokens, adaptive subscriptions, screen sharing, speaker events, reconnection, and host-oriented room APIs. Production integration requires a dedicated TLS/WSS endpoint, server-only API credentials, authenticated room membership/token issuance, short-lived TURN credentials, firewall configuration, privacy-conscious metrics, and recorded capacity limits. No infrastructure or secrets were available, so operational group conferencing remains **Infrastructure-dependent**.

## Phase 3 backend status

### Call state

The existing server already supplied unique UUID call IDs, persistent call records, participant records, authenticated signaling, a configurable server-side ring timeout, missed-call conversion, and user-level event fan-out. Phase 3 adds transaction boundaries and row locking to acceptance/state updates, preventing concurrent requests from racing a terminal invitation. Repeated acceptance by the same user is idempotent. A terminal invitation returns HTTP 409 with `CALL_NOT_ACTIVE`.

The current model identifies participants by user rather than by device session. It synchronizes all open sessions through the user's event channel, but complete device-level attribution and one-winning-device metadata require a session/device identifier migration and physical multi-device validation.

### Additive database migration

Prepared migration: `server/migrations/20261031_communication_backend_foundation.sql`.

It adds normalized records for:

- user history and notification preferences, DND, quiet hours, and timezone;
- device-specific push subscriptions with endpoint hashing, failure state, and expiry;
- per-user message visibility, retention and archive state;
- individually saved messages;
- message-level legal holds;
- deduplicated notification delivery attempts.
- device-specific call invitation/acceptance ownership and cross-device resolution state.

The migration has not been applied to any database. Before application, create and verify a backup, run it against a production-like clone, validate foreign-key column compatibility and MySQL version support, then test application rollback while leaving additive data intact.

### Required secure configuration

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (a monitored `mailto:` or HTTPS contact)
- `LIVEKIT_URL` using secure WebSocket transport
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- TURN host/realm and a server-side credential-signing secret for short-lived credentials

None of these values is hardcoded or present in the source changes. Push delivery and SFU token issuance remain disabled until the corresponding service and secrets are provisioned.

## Security and privacy assessment

- The repair introduces no new endpoint, credential, dependency, database mutation, or content logging.
- Browser WebRTC transport remains encrypted in transit by the platform, but end-to-end encryption has not been independently implemented or verified and must not be claimed.
- A production media design needs authenticated short-lived SFU access tokens, short-lived TURN credentials, strict meeting membership checks, rate limits, invitation expiry, and privacy-conscious quality telemetry.
- Sensitive messages and authentication material must not be cached for offline use by a future service worker.

## Recommended production architecture

Retain CIMS authentication, permissions, messaging APIs, audit records, and the primary database. Add a dedicated, authenticated SFU media tier (LiveKit is the preferred initial evaluation because it packages rooms, participant events, adaptive subscriptions, screen sharing, and operational tooling). Use a TURN service with short-lived credentials. Add a Web Push worker/service backed by device-specific subscriptions. Add a separate idempotent retention worker using per-participant visibility and preservation records.

The final vendor selection remains pending a verified hosting-capacity, firewall, cost, regional-latency, and operations assessment. No media service should be introduced directly into production without a controlled proof of concept.

## Requirement classification

| Requirement | Status | Evidence / limitation |
|---|---|---|
| Independent local and remote participant rendering | Implemented, verification pending | Participant-keyed media tiles implemented; requires two physical devices. |
| Explicit browser echo-control constraints | Implemented, verification pending | Capture constraints implemented; acoustic/device testing still required. |
| Duplicate local track prevention and teardown | Implemented, verification pending | Existing sender-ID guard and call teardown retained. |
| Server-authoritative call acceptance | Implemented, integration verification pending | Transactional row locks, participant authorization, idempotent repeat acceptance, terminal-state conflict, audit, and session fan-out are implemented. Physical multi-device verification remains pending. |
| Scalable group voice/video | Blocked | Requires approved SFU/TURN infrastructure and capacity testing; current mesh is not acceptable at scale. |
| Gallery layout | Implemented, verification pending | Responsive participant tiles exist for current peer topology. |
| Peer-call screen sharing and local media controls | Implemented, physical verification pending | Outbound track replacement, automatic camera restoration, mute and camera toggles compile and lint successfully; browser/device acceptance remains pending. |
| Active speaker and host controls | Pending | Requires the approved SFU/session architecture and server-authoritative host roles. |
| Closed/background browser incoming-call push | Blocked | Requires push subscriptions, backend sender credentials, service-worker handlers, and device testing. |
| Installable PWA build assets and safe API cache policy | Implemented and build-verified | Manifest and generated service worker passed production build; physical installation and OS behavior remain unverified. |
| Rolling 30-day per-user retention | Partially implemented, not applied | Additive preference, visibility, saved-message and legal-hold schema is prepared. API integration, dry-run cleanup worker, migration testing, and policy approval remain pending. |
| Modern communication UI | Implemented, partially verified | Existing responsive Riana-branded workspace retained; full device/browser matrix remains pending. |
| Two-device audio/video acceptance test | Blocked | Two physical non-production devices/accounts were not available in this session. |

## Deployment prerequisites and staged rollout

1. Validate this bounded repair with two non-production accounts on two physical devices, including video, audio, mute, hang-up, permission denial, and reconnection.
2. Run Chrome/Edge/Firefox combinations with built-in speakers, wired headset, and Bluetooth headset.
3. Measure mesh behavior only as a temporary compatibility path; cap participants until the SFU is approved.
4. Prototype the SFU and TURN tier in an isolated environment; verify authorization, regional latency, capacity, monitoring, and cost.
5. Design and review additive retention and push-subscription migrations, then exercise rollback against a production-like backup.
6. Deploy progressively behind feature flags with call setup, ICE failure, disconnect, push failure, and cleanup-job metrics.

## Rollback

- Application rollback: revert the participant-stream/media-constraint change; no database rollback is required for this phase.
- Stop new SFU, push, or retention phases behind feature flags before rolling back their application consumers.
- Future additive tables should remain in place during application rollback to avoid destructive data loss; remove them only through a separately reviewed migration after retention/backup obligations are satisfied.

## Remaining risks

- STUN-only connectivity will fail for some restrictive NAT/firewall environments.
- Mesh group calling scales poorly and must have a conservative temporary participant limit.
- Browser audio processing reduces application-induced echo but cannot eliminate room acoustics or loudspeaker feedback.
- Browser and operating-system restrictions prevent guaranteed ringing when the app is fully closed; guaranteed native background calling requires a separately scoped native client.
- Real-device acceptance, infrastructure capacity, push delivery, cross-device atomic acceptance, and retention cleanup remain release blockers for the complete modernization.

## 2026-11-01 consolidated reliability and account-security closure

### Confirmed root causes

- Remote media autoplay rejection was swallowed, leaving silent audio or an unexplained black tile with no recovery action.
- Microphone constraints used a hard channel-count requirement and UI state was not synchronized with live track mute, unmute, or ended events.
- The header badge mixed operational category totals with a different visible notification list; handover totals were also calculated for roles that could not receive the corresponding rows.
- The greeting used browser-local hours rather than the authenticated communication preference timezone and did not implement the required night period.
- Password changes relied on a separate client-side verification call; the mutation endpoint did not itself verify the current password.
- Saving an MFA phone/method immediately enabled MFA without confirming possession of the destination.
- No WebAuthn credential/challenge persistence or passkey verification path existed.

### Implemented and verified locally

- Remote audio/video playback rejection now exposes a retry control. Local camera-off and audio-only calls render explicit participant states rather than black tiles.
- Live audio/video track events drive microphone and camera state, and microphone acquisition uses compatible ideal constraints.
- Persistent notification unread count and rows now come from one authenticated server summary. Operational assignment, installation, handover, and announcement totals are displayed separately as categories.
- Timezone-aware greeting periods include `Good night`; invalid stored zones safely fall back to `Africa/Nairobi`. Boundary and multi-timezone tests pass.
- Password changes enforce current-password verification at the mutation endpoint and require a stronger 12-character mixed-case/number baseline.
- MFA changes require current-password verification. Enabling MFA requires a one-time delivered enrollment code before the setting is persisted.
- WebAuthn passkey enrollment and authentication use server-generated five-minute challenges, expected origin and RP ID validation, required user verification, single-use challenge consumption, credential counters, duplicate credential protection, account-status checks, audit events, and existing session issuance. Existing mandatory MFA remains an additional login step.
- Users can list and revoke their passkeys and review/revoke backend sessions. The manual app lock revokes the backend session and clears local credentials; it is not a cosmetic overlay.
- The additive local migration `20261101_passkeys_and_account_security` applied successfully to the local development database. No production migration was attempted.

### Actual validation results

| Check | Result |
|---|---|
| Backend syntax (`server/index.js`, passkey service) | Passed |
| TypeScript (`npx tsc --noEmit`) | Passed |
| Authentication/timezone tests | 6 passed |
| Communication tests | 11 passed |
| Focused ESLint | Zero errors; remaining warnings are pre-existing explicit-`any` patterns |
| CIMS build and PWA generation | Passed after final integration; 6,189 modules and 107 precache entries |
| CRMS build | Passed after final integration; 3,256 modules |
| Local services | Restarted after final build; Riana frontend and API returned HTTP 200 |
| Production dependency audit | Passed; zero production vulnerabilities reported |
| Browser smoke test | Passed at 320px and 1440px; passkey control visible, no horizontal overflow, no console/page errors |

### Messaging display modes

The messaging workspace and active-call panel support full-screen, exit-full-screen, and minimize controls. Minimizing changes presentation state only: the mounted communication component, media streams, signaling listeners, and peer connections remain active. The persistent minimized-call dock retains microphone, camera, elapsed-time, return-to-call, and hang-up actions. Full-screen mode uses the same call instance and does not create duplicate peer connections.

Active meetings also support raise/lower hand and transient reactions (`👍`, `👏`, `❤️`, `😂`, `🎉`). Events use the existing authenticated, device-owned call signaling route; the server validates the event type and exact payload, derives sender identity from the session, and confirms that both sender and recipient belong to the active call. Raised hands remain visible on participant tiles until lowered, while reactions expire from the interface after five seconds and are not written to message history.

### Pending and blocked acceptance

- Passkey registration/sign-in and biometric/PIN prompts require physical browser/authenticator testing. Production requires HTTPS plus reviewed `WEBAUTHN_ORIGIN` and `WEBAUTHN_RP_ID` values; these are not hardcoded.
- Two-way microphone/video, acoustic echo, screen sharing, device selection, autoplay behavior, navigation persistence, background push, and cross-device winning acceptance remain pending on two physical non-production devices.
- SFU/TURN group conferencing and capacity acceptance remain infrastructure-dependent.
- The secure inactivity policy currently ends the authenticated backend session after the existing timeout. A resumable locked-session design would require a separately scoped restricted-session token state; no frontend-only unlock was introduced.

### Deployment and rollback

1. Back up and validate a staging database, then apply communication migrations followed by `20261101_passkeys_and_account_security.sql`.
2. Configure the exact HTTPS WebAuthn origin and RP ID for staging; test registration, assertion, expiry, replay, wrong-origin rejection, revocation, MFA chaining, and account disablement.
3. Complete the two-device checklist and push/background acceptance with non-production accounts.
4. Deploy the API before exposing the new client UI, monitor authentication failures and audit events, then roll out progressively.
5. Application rollback may return to the previous client/API while leaving additive passkey tables intact. If schema removal is later approved, use the supplied rollback only after credential data retention and backup review.

### Production-readiness decision

**Not production-ready.** Independently testable local implementation is complete, but physical media/passkey/PWA acceptance, staging-origin validation, and SFU/TURN infrastructure evidence remain mandatory release gates.
