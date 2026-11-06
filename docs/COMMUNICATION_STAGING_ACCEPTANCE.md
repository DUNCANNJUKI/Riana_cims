# Communication Staging Acceptance

## Disposable database prerequisite

Use a dedicated MySQL 8-compatible database containing a verified restore of staging schema and anonymized/non-production data. Never point these commands at production.

```powershell
$env:DATABASE_HOST='127.0.0.1'
$env:DATABASE_PORT='3306'
$env:DATABASE_NAME='riana_cims_communication_validation'
$env:DATABASE_USER='riana_validation'
$env:DATABASE_PASSWORD='<temporary validation password>'
node server/scripts/apply-migration.cjs
```

The migration runner applies all unapplied SQL migrations in filename order. Use a disposable database restored to the same pre-migration state as staging; do not attempt to target only the final file by passing an extra argument.

Before migration, record row counts for `user_profiles`, `messages`, `call_participants`, `message_recipient_status`, and attachment metadata. After migration:

1. Compare those counts and representative checksums; existing rows must be unchanged.
2. Verify the new tables, foreign keys, unique constraints, and indexes using `SHOW CREATE TABLE` and `SHOW INDEX`.
3. Rerun the migration to validate its intended repeat behavior.
4. Start the candidate API against only the disposable database and exercise preferences, subscriptions, saved messages, archive/clear visibility, and device-winning calls.
5. Run `npm run communication:retention:dry-run`; inspect candidates and confirm no visibility rows changed.
6. Only with separate staging approval, enable retention execution against synthetic expired messages and confirm per-user isolation.

## SFU/TURN staging requirements

- Dedicated LiveKit-compatible SFU URL with TLS/WSS.
- Server-only API key and secret; browser clients receive short-lived, room-scoped tokens only.
- Participant identity derived from the authenticated CIMS user ID; room membership checked server-side.
- TURN over UDP/TCP and TLS on documented firewall ports, using short-lived credentials.
- Host claims enforced server-side for participant removal and meeting termination.
- Metrics for room count, participant count, packet loss, reconnects, CPU, memory, bandwidth, and TURN allocation failures.

Capacity testing must ramp gradually with representative audio, camera, and screen-share publishers. Record maximum stable participants, upstream/downstream bandwidth, CPU/memory headroom, reconnect behavior, and failure thresholds. Until these tests pass, current group mesh remains a bounded compatibility path, not production conferencing.

## Rollback

Roll back the application deployment first and disable communication feature flags. Retain additive communication tables during rollback to avoid data loss. Revoke staging VAPID/SFU/TURN credentials if exposure is suspected. Do not drop tables or permanently delete messages without a separately reviewed data-disposal change.
