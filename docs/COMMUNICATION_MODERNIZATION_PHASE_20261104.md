# Communication Modernization: 4 November 2026

## Audit summary

The existing Communication module is an established chat and bounded peer-to-peer calling system. It already includes authenticated call creation/status APIs, participant records, per-participant remote media, local preview, device selection, screen sharing, reactions, transient hand signals, active-speaker detection, push delivery, missed-call handling, and message history features. This phase extends those paths rather than replacing them.

Confirmed gaps at the start of this phase:

- No endpoint or UI flow invited a new participant into an active call.
- Meeting signaling allowed only an accepted device session, which prevented an organizer from sending an initial offer to a ringing invitee.
- ICE configuration was hard-coded to public STUN, with no TURN configuration or reconnect attempt.
- The local preview had no mirrored self-view label and could show an empty/black preview if a camera track stopped.
- Disconnected/declined invitees remained in the visible participant list because the UI did not use participant lifecycle status.
- Reactions and raised hands are transient best-effort signaling. They are not server-authoritative state and do not recover after reconnect.
- The layout supports gallery and speaker sizing, but not movable picture-in-picture, pin/spotlight, a dedicated participants panel, or mobile bottom-sheet panels.
- Calls use a bounded peer mesh. No SFU service, capacity controls, or adaptive server-side stream subscriptions exist.

The repository's existing staging documentation records previous communication migrations and staging gates. The completion phase adds one additive, rerunnable migration for durable meeting state and invitation outcomes. It has not been applied to any database.

## Phased implementation plan

1. **Reliability and participant representation:** retain the peer-per-user architecture, use lifecycle state for visible participants, add configurable relay ICE and a single guarded ICE restart, and ensure the local tile presents a camera fallback.
2. **Active call invitations:** authorize invitations to the call organizer, reuse `call_participants`, notify through current SSE and Web Push services, deduplicate active invitations, and let invitees use the existing accept/decline and media path.
3. **Responsive meeting controls:** add the in-call invitation picker and participant count while preserving chat, call controls, device selection, and screen sharing.
4. **Meeting state and responsive controls:** persist hand/media/spotlight state, add invitation cancellation/expiry/failure outcomes, participant and chat panels, movable self-view, local pinning, and organizer spotlight.
5. **Scale and release gates:** provision and capacity-test TURN/SFU infrastructure; validate migrations, invitations, state recovery, media, and responsive layouts in staging and on physical devices.

## Changes in this phase

- Added authenticated `GET /api/chat/calls/ice-servers`, returning public STUN plus optional TURN REST credentials derived from the server-only `WEBRTC_TURN_SHARED_SECRET`. TURN URLs come from `WEBRTC_TURN_URLS` or `WEBRTC_TURN_URL`; credentials expire after one hour and are not cached by the endpoint.
- Added authenticated `POST /api/chat/calls/:callId/participants`. Only the active call creator can invite. The handler locks the call row, checks active call state and organizer membership, limits a request to eight unique IDs, checks that selected accounts are active, skips existing active memberships, upserts invitation state, notifies recipients through the established SSE and push services, and publishes the updated call participant list. No schema change is required.
- Extended call signaling to allow the joined organizer to send an initial offer to a ringing/invited participant. Sender device ownership remains required for device-owned sessions; recipient must already be a member of that call.
- Added a strict `media-state` signaling payload for camera and microphone status. This lets remote tiles distinguish an intentionally disabled camera from a missing/stalled video track without persisting ephemeral state.
- Fixed the local video preview attachment race: camera media can be acquired and sent before the active-call tile mounts, so the preview video now binds the current stream on element mount and rebinds when the active call changes. This prevents the local self-view from remaining black while remote participants receive video.
- Kept call records in conversation history even though the API clears their text content for privacy. The hosted-placeholder filter now skips call messages, so ringing, answered, ended, declined, and missed call records remain visible in the corresponding chat.
- Added an in-call colleague search and invite picker, a synchronized participant count, mirrored local preview, explicit local camera-unavailable fallback, and participant filtering based on active lifecycle states.
- Added one guarded ICE restart attempt when a peer connection fails or disconnects. Successful recovery clears the retry guard, refreshes peer media state, and peer teardown cancels pending timers.
- Added `20261104_communication_meeting_state.sql`, which extends the existing participant status enum with cancelled/expired/failed outcomes, adds durable hand/media/screen state to participant rows, and creates per-call spotlight state. Existing rows are preserved and optional reads fall back safely when the migration is not yet installed.
- Added organizer invitation cancellation, automatic expiry, and failure reporting when every configured push delivery fails while the recipient is offline. Acceptance is rejected for cancelled, expired, failed, or otherwise terminal invitations.
- Reworked group leave behavior so an individual participant can leave without ending the whole group call; the organizer can end the meeting. Hand state is cleared on leave/cancel/expiry and meeting end.
- Persisted and restored hand ordering, media state, and spotlight through existing call participant updates; rejoin now reloads the active call, restores invitation or meeting state, and lets the user explicitly reconnect media after browser reload.
- Added collapsible Participants and Chat views that prioritize the gallery below 1024px, a touch-draggable in-app self-view, per-user pinning, and organizer-controlled synchronized spotlight. The native browser PiP API is not required.
- Meeting reactions now render on the originating participant tile, and participant galleries page in bounded sets for larger mesh meetings instead of producing an unbounded DOM grid.
- Video calls can blur the room or use the RIANA Office background with local person segmentation. The MediaPipe model and WebAssembly runtime are served from this application and camera frames are processed on-device. The user must explicitly consent to MediaPipe usage/performance metrics being sent to Google before enabling effects. The model/runtime use a bounded service-worker cache after first load; camera selection and screen sharing remain independent, and background changes are disabled while sharing.
- The office scene is an app-owned vector illustration using the existing transparent RIANA logo. The segmenter is `@mediapipe/tasks-vision` 1.2.2 with the official landscape selfie-segmentation model; see [MediaPipe Image Segmenter](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter) and its [privacy notice](https://www.npmjs.com/package/@mediapipe/tasks-vision).
- Added eight more named call backgrounds from the supplied office images, including the RIANA Innovation Workspace and Welcome Lobby. Backgrounds are listed by distinct room names and load/cache on selection rather than being forced into every PWA install.
- On compact screens, in-call controls are grouped under one accessible overflow action; desktop retains the full toolbar. Video calls default to the front-facing camera where available and expose a camera-cycle action when multiple cameras are detected. Call reactions animate as floating overlays with reduced-motion support, and shared-screen video uses contain sizing so its full aspect ratio remains visible in local and remote tiles.
- Extracted ICE credential generation and call-signal payload validation into a focused server helper; automated tests cover TURN credential scope/expiry/signing, accepted reaction values, strict payload shapes, and SDP/ICE size bounds.
- Missed-call dismissal now waits for the authenticated persistence request before removing the notification, reports failed saves, and suppresses late call events and in-flight snapshots for dismissed calls. The legacy-compatible dismissal-table migration is included in the Truehost live-update bundle.
- Hardened missed-call dismissal with one atomic user-scoped `INSERT ... SELECT` and made the optional audit write non-blocking after durable success. Call creation now uses the directory's null-safe active-account predicate and treats its audit write as non-blocking, preventing successfully saved calls from being reported as failed due to audit logging.

## Security and compatibility

- Invitation requests still require the existing authenticated CIMS session.
- The organizer check is based on the call creator because the existing schema has no separate host/organizer role.
- The target directory follows the existing chat directory's active-user boundary. There is no tenant/subsidiary filter in the existing `/api/chat/users` implementation; this change does not widen that directory.
- TURN shared secrets remain server-side. Browsers receive only an expiring per-user username and HMAC credential. Provision a TURN service configured for the standard shared-secret REST credential scheme before setting the TURN environment values.
- Existing call/message records are reused. No API fields were removed. The new migration is additive, but must be applied before durable meeting state and invitation outcome features are enabled.
- Group calling remains mesh and is not represented as an SFU or unlimited-capacity solution.

## Validation status

Validation on 4 November 2026: TypeScript check passed; main and CRMS production builds passed; communication suite passed 16/16 and the missed-call state suite passed 3/3; API suite passed 107 tests with two opt-in database suites skipped; authentication suite passed 14/14; security suite passed 10/10; server syntax check passed; targeted lint on changed communication files passed with zero warnings. Full repository lint passed with 385 warnings and zero errors. The atomic missed-call dismissal SQL was exercised against an existing local fixture inside a transaction and rolled back. The meeting-state migration was applied and rerun successfully in disposable local schema `riana_cims_communication_test_20261104`, created from the four required table definitions with no application records; required columns, statuses, meeting table, and one migration-history row were verified. That disposable schema was removed after validation; the configured `riana_cims` database was not migrated. The local deployment pipeline rebuilt the host export, CIMS and CRMS assets, release staging tree, deployment tree, and four deployment archives. Deployment verification, archive content checks, and all eight package SHA-256 checks passed. Automated checks do not replace two/three-device invitation, real permission/device, mobile viewport, network interruption, or staging database acceptance. Nothing was deployed or pushed.

## Rollback

Roll back the application files together and retain the additive meeting migration objects and data. Do not remove participant state or invitation outcomes as part of an application rollback. Unset `WEBRTC_TURN_URLS`/`WEBRTC_TURN_URL` and `WEBRTC_TURN_SHARED_SECRET` to return the ICE endpoint to its STUN-only response.

## Video-call visual refinement — 7 November 2026

- Gallery tiles now keep a 16:9 frame and camera video uses `object-contain` in gallery view to avoid cropping faces and bodies; speaker view retains `object-cover` for a focused frame. Screen sharing remains `object-contain`.
- Local preview mirroring is consistent with and without a virtual background; screen sharing is not mirrored.
- Call controls wrap in aligned groups at constrained desktop widths, labels stay compact until very wide screens, and the existing mobile overflow menu and action handlers remain intact.
- Verification: CIMS and CRMS production builds passed; communication regression suite passed 25/25. Live camera framing, multi-device calls, real background segmentation, and viewport-by-viewport browser acceptance still require physical browser/device verification.
