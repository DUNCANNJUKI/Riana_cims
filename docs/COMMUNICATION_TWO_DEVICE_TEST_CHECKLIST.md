# Communication Two-Device Acceptance Checklist

Use non-production accounts and test data. Record browser versions, operating systems, network type, device models, timestamps, call IDs, and evidence references. Do not use live business conversations.

## Preconditions

- Two separate physical devices with camera, microphone, and speakers/headsets.
- Two authorized non-production CIMS accounts in the same permitted organization scope.
- HTTPS deployment with the candidate build and authenticated signaling available.
- Camera, microphone, and notification permissions reset before the permission tests.
- No production database, push credentials, or live customer records involved.

## One-to-one video

- Device A calls Device B and both see independent local and remote video.
- Local previews are muted and do not reproduce local microphone audio.
- Caller and recipient labels match the authenticated accounts.
- Denying camera permission produces a clear error and releases any microphone already acquired.
- Ending from either device stops every local media track and removes the remote tile.
- Repeat the call five times and confirm no ghost tiles, duplicate audio, or retained camera indicator.
- Navigate through Dashboard, Clients, Installations, Inventory, Reports, and Settings while connected; confirm media continues and the compact call panel remains usable.
- Minimize the call panel, verify the timer remains accurate, then return to the full call.

## Audio and echo

- Test built-in speaker/microphone in a quiet room and note any acoustic echo separately from duplicate application playback.
- Test wired headset and Bluetooth headset.
- Speak from one device at a time and verify the remote audio is played once.
- Verify mute/unmute on both devices; the controls are implemented, but physical acceptance remains pending.
- Verify mute/unmute from both the full call and compact persistent panel.
- Toggle each camera and verify the remote camera-off placeholder and participant label.
- Select each available microphone and camera during a call and verify the remote track changes without a duplicate peer connection.
- Run the microphone level test, then stop it and confirm its temporary capture track is released.
- Select each speaker where the browser exposes output routing; where unsupported, verify the UI explains the limitation.
- Change or disconnect an active input device and confirm the implemented default-device fallback. Physical acceptance remains pending until recorded here.

## Signaling and lifecycle

- Answer, decline, caller cancel, recipient missed-call timeout, and remote hang-up.
- Open two sessions for the recipient and verify the implemented atomic cross-device acceptance behavior; physical acceptance remains pending.
- Register two recipient devices, answer on Device B1, and verify Device B2 immediately stops ringing.
- Retry acceptance on B1 and verify it is idempotent; attempt late acceptance on B2 and verify `CALL_ACCEPTED_ON_ANOTHER_DEVICE`.
- Verify B2 cannot send offers, answers, or ICE candidates after losing ownership.
- Interrupt each network for 10 seconds and restore it; record ICE state and whether recovery occurs.
- Navigate within the application during an active call and verify persistence. A full browser refresh is expected to require signaling/media recovery and must not be marked passed without observed evidence.
- Verify unauthorized accounts cannot fetch the call, signal it, or retrieve its attachments.

## Group compatibility test

- Test three participants only as a temporary mesh-compatibility check, not as SFU acceptance.
- Confirm each participant tile maps to the correct authenticated user and no stream replaces another.
- Measure CPU, upstream bandwidth, setup time, and disconnections.
- Do not raise the production participant limit or call this scalable until an SFU capacity test passes.
- Verify Gallery and Speaker layouts, participant labels, active-speaker highlighting, and camera-off placeholders.
- Test screen sharing from each authorized participant and verify camera restoration afterward.
- SFU join/leave, host removal, meeting termination, adaptive video, TURN traversal, and capacity remain pending until staging infrastructure exists.

## PWA and notification checks

- Install from a supported Chromium browser and verify branding, standalone launch, and authenticated routing.
- Verify foreground notification permission behavior, denial behavior, and missed-call presentation.
- Verify background incoming-call and message push on each supported physical device.
- Click each notification and verify the existing CIMS window focuses or a new authenticated window opens on an internal route.
- Remove a subscription and verify that device no longer receives push while other registered devices still do.
- Closed-browser Web Push, device subscription cleanup, DND, and cross-device cancellation are implemented in the application/backend foundation but remain pending physical-device and staging acceptance.

## Acceptance record

For every item, record `Pass`, `Fail`, `Blocked`, or `Pending`, with evidence. A local preview, emulator-only run, or single computer with two tabs is not evidence for physical two-device acceptance.

All physical-device items in this checklist remain **Pending** until evidence is recorded.
