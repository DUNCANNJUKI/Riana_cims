# Inventory Operations Update

## Supporting Documents

File URLs are normalized to avoid `/api/api/files`. Thumbnails, full image
previews, document previews and downloads use authenticated requests; no JWTs are
placed in URLs and no private folder is made public. Image failures expose retry
controls. Thumbnail layout is bounded on desktop/mobile.

Both handover-save paths now check asset, original page name and SHA-256 under
transaction locks before capturing a page. Exact repeated captures are skipped.
The file list hides older exact duplicates without deleting metadata, audit logs
or physical files. Different pages and different document versions remain.
Existing external PRIVATE_UPLOAD_ROOT/LEGACY_UPLOAD_ROOT values must be preserved.

## Variants

The Models view includes a Variants register. Users with inventory.approve_models
can create variants. Edit/delete are allowed only with no hardware model or model
counter dependencies; backend locking enforces this even for direct API calls.
Deletion retains a tombstone, so SQL seed replay cannot restore deleted variants.
Issued serials and dependent models are never renamed. Family and variant codes
must fit the existing serial grammar; model/serial sequencing stays unchanged.

## Stocktake

Choose subsidiary/location, enter serials, manufacturer serials or asset IDs, or
scan safe QR labels. Preview resolves identities case-insensitively and shows
matched, missing and unexpected items. Only verified physical on-hand stock is
expected; Generated, Installed, Retired, Disposed and In Transit are excluded.
Unknown identities never expose another subsidiary's asset details.

The preview includes a snapshot hash. Apply rejects stale previews, and missing
items require explicit confirmation. Counts update reconciliation state only;
they do not manufacture, verify, relocate or install stock. Results and audits are
saved transactionally and results can be exported as CSV with formula escaping.

API: POST /api/hardware/reconcile-preview accepts subsidiary_id, location_id and
observed_ids. POST /api/hardware/reconcile additionally accepts snapshot and
confirm_missing. Both require inventory.reconcile and subsidiary scope.
Variant mutations are variant_create, variant_update and variant_delete under
/api/hardware, with the existing Idempotency-Key contract.

## Scheduling Dates

Future-facing inputs and API writes reject newly past dates in Africa/Nairobi:
installation/assignment scheduling, announcement expiry, maintenance completion
and Developers estimated completion. Unchanged legacy scheduling values remain
editable without rewriting history. Manufacturing, warranty, actual completion,
request history, client start dates and report filters retain historical access.
No existing dates are rewritten by the migration.

## Inventory Reports And Friendly Failures

Inventory Officers use Hardware & Inventory > Reports. Totals and CSV summary
retain authorized subsidiary, location, model, equipment family, search and other
shared filters. Selecting a total drills into the asset register. Summary totals
ignore the selected status/report so comparisons remain visible.

- In stock: Available, Reserved and Returned lifecycle records.
- Out / issued: Assigned, Installed and In Transit lifecycle records.
- Faulty, Maintenance, Returned and Generated / unverified remain separately visible.
- Ready to assign applies verification, approval, condition, reconciliation and
  active-assignment checks; it can be lower than recorded Available stock.

Returned and ready-to-assign totals overlap their broader groups; do not add the
summary tiles together. The complete lifecycle status breakdown in the summary CSV
reconciles to registered total. These are current lifecycle counts, not a physical
stock certification or historical as-of balance. Use Stocktake for physical counts.
Date filters on assets apply to registration dates; Stock Movements dates apply to
event timestamps. Existing movement reports retain actor, action, time and details.
Every listed lifecycle status, including Returned, In Transit, Retired and Disposed,
is selectable. Exports require inventory.export. No permissions were broadened.

GET /api/hardware/summary adds backward-compatible status_totals while retaining
counts (eligible Available) and pending. Asset reports accept report=in_stock or
report=out. No new schema or data migration is required for reporting.

Shared CIMS API/file clients and Developers data hooks show actionable generic
server/network failures without exposing SQL responses. Business validation and
maintenance messages remain available. Network errors advise checking whether a
write saved before resubmitting; mutations are not automatically retried. Default
destructive notifications last 12 seconds, with existing explicit durations retained.

## Deployment And Rollback

### Local External Storage Completion

Local CIMS now uses the approved `D:\riana-cims-data` directory with private_uploads,
legacy_uploads and file_backups subfolders, configured only in the private local
environment file. Twenty-five existing files were copied and SHA-256 verified;
originals and a configuration/audit backup remain. Both active supporting-document
records resolve and match their checksums from the external root. No database
references were changed. Do not deploy these Windows paths to Linux hosting.

`server/scripts/copy-external-upload-storage.cjs <external-folder>` is a dry-run by
default. It refuses nested destinations, source links and conflicting existing
files. Applying requires `--apply` and CIMS_UPLOAD_WRITES_STOPPED=true after stopping
upload writers. It copies and verifies, never deletes sources, and does not edit
environment files. Configuration must change only after verification succeeds.
For rollback after new uploads, reconcile newer external files before restoring
the backed-up environment; keep external files and the audit manifest.

Use the newest consolidated package only. LIVE_DB_UPDATE.sql includes
20261016_inventory_operations.sql: nullable variant deleted_at and a supporting
document identity index. It does not delete or relocate uploads or duplicate rows.
The local targeted migration backs up variants and document metadata under the
web-blocked .runtime/backups directory before adding schema. Cloud backups remain
required before DDL. Restore prior code for rollback; retain new columns, variant
tombstones, file metadata, private files and reconciliation history.
