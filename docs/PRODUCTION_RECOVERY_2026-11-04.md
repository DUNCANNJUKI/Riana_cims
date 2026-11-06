# Production recovery and stability report — 2026-11-04

## Confirmed diagnosis

- Hardware Inventory accepted any truthy catalog response and immediately read
  `catalog.data.policy.issuance_approved`. A partial recovery response without
  `policy` therefore caused the observed runtime exception. The client now
  normalizes the response and treats absent or malformed approval data as not
  approved. Browsing can continue, but governed issuance remains disabled.
- `GET /api/notifications/summary` and
  `GET /api/communication/preferences` are registered behind authentication in
  the current `server/index.js`. A 404 from production is therefore evidence of
  an older/mismatched API artifact or reverse-proxy target, not an absent route
  in this source release. Database absence would produce 500/503 from these
  handlers, not 404.
- The reported MySQL #1452 and #1062 errors are consistent with an out-of-order
  historical import and a collision with an existing singleton row. They do not
  by themselves prove that every current application failure is database-caused.
- The release cache helper previously unregistered same-origin service workers
  during a release transition. It now requests a normal worker update while
  limiting cleanup to generated RIANA/Workbox caches; user storage is retained.
- `/api/health` now reports a bounded `APP_RELEASE`/`GIT_COMMIT` identifier so
  operators can prove which API artifact the proxy is serving.

## Communication modernization continuation

The existing implementation already provides participant-keyed tiles, local
self-view/avatar fallback, camera-off remote avatars, Gallery/Speaker layouts,
active-speaker indication, screen sharing, device selection, raised hands, and
transient authenticated call reactions. This iteration completes the requested
six-reaction set, uses stable Unicode escapes, adds client-side reaction pacing,
and respects reduced-motion preferences.

The current browser mesh remains deliberately bounded. Ongoing-call invitations,
host spotlight/lower-hand controls, authoritative hand ordering, draggable
self-view, and production-scale group media remain incomplete until an approved
SFU/TURN room service and server-authoritative meeting-role model are provisioned.
Those capabilities must not be represented as production-ready on the existing
peer mesh.

## Controlled database assessment

`server/scripts/production-recovery-diagnostics.sql` is read-only. It inventories
critical schema, the governed hardware policy, the known audit-log orphan
relationship, other critical orphans, singleton configuration, foreign keys,
and indexes. It must be run against a verified backup/clone first. It does not
restore data and intentionally excludes announcements and announcement reads.

No production database query, repair, migration, or import was performed during
this implementation. Any INSERT-only reconciliation must be generated only after
reviewing captured diagnostic results against the 16 October backup and current
live data.

## Deployment consistency checks

1. Verify a current restorable production backup.
2. Record the live `/api/health` response and running PM2 process path/version.
3. Compare the API artifact commit/build metadata with `BUILD_INFO.json` in the
   deployment package.
4. Request both affected endpoints with an authenticated non-admin test account.
   A proxy/app 404 confirms routing or artifact mismatch; do not mask it in the
   frontend.
5. Deploy API before the matching static client, then verify the health endpoint,
   both API contracts, and Hardware Inventory before enabling normal traffic.
6. Purge only release static assets at the CDN/proxy layer. Keep user storage and
   PWA data intact. Confirm the new service-worker version activates normally.

## Rollback

Rollback is application-only: restore the preceding matching frontend/API pair.
The catalog normalizer introduces no database change. Keep additive migrations
in place unless a separately reviewed rollback explicitly proves removal safe.
If recovery SQL is later authorized, take a new backup and prepare table-specific
rollback statements before execution.

## Current readiness

The source repair is pending the recorded automated build/test results and live
read-only database diagnostics. Until production artifact consistency and data
integrity are verified, status remains **NOT READY FOR DEPLOYMENT**.

## 2026-11-05 inventory policy follow-up

The sanitized hosting database export created `hardware_policy` but omitted its
required singleton row. The current client correctly fails closed when the
catalog omits valid policy data, keeping serial issuance disabled. The export
now seeds only the default unapproved policy, and the additive
`20261105_hardware_policy_default_bootstrap` migration inserts that default only
when row `id=1` is missing. It does not replace existing approval metadata.

The deployment database archive is a clean-install starter containing no live
operational asset records. Do not import it over an existing production
database. For an already imported database, inspect `hardware_policy` and take
a verified backup before applying the additive migration or inserting only the
missing default row. Zero asset totals require separate data recovery assessment
against the pre-import backup; the policy repair does not recreate assets.
