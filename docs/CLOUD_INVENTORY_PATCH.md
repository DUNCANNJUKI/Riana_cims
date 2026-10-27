# Cloud Inventory Patch - 14 October 2026

## Consolidated Release

The 16 October inventory operations update normalizes authenticated file URLs,
loads private images/previews/downloads through authenticated requests, prevents
repeat handover-page captures and suppresses old exact duplicates without file
deletion. It adds dependency-guarded variant management and stocktake
preview/confirmation/export with stale-preview protection. Future-facing schedule
dates reject past selection in Africa/Nairobi while preserving unchanged legacy
values and historical/report inputs. See INVENTORY_OPERATIONS.md. The aligned SQL
adds variant deletion tombstones and a document identity index without rewriting
dates, files or existing inventory records.

Cache refresh rollout uses browser release marker
`scheduling-20261016-4`. On the next application load it clears only
RIANA/workbox caches and the relevant same-origin service workers; cookies,
authentication storage and unrelated caches remain. Derived local Vite caches can
be cleared with the web process stopped. The consolidated package carries the
rebuilt runtime assets and the aligned LIVE_DB_UPDATE.sql; package generation is
not a remote deployment or execution against the cloud database.

The installation form now iterates the saved equipment definitions for field
names, ordering and visibility, rather than maintaining separate hard-coded
equipment inputs. Existing values, IDs, display names and serial mappings remain
intact. This changes only the equipment entry surface; E-handover generation,
signing, upload and supporting-document processing retain their existing paths.

The hybrid equipment update retains existing built-in columns and adds validated
custom equipment definitions with stable IDs in subsidiary configuration. Custom
installation counts use equipment_quantities JSON; inventory mappings, serial
requirements and handover output consume the same definitions. The release SQL
includes 20261015_hybrid_equipment.sql. See HYBRID_EQUIPMENT.md for workflow,
validation, removal protection and rollback. No hard-coded new form fields are
required to add another equipment type.

New releases use RIANA-CIMS-CLOUD-PATCH-YYYYMMDD-HHMMSS-EAT.zip with a readable
Africa/Nairobi timestamp. Deploy only the single consolidated ZIP in `release/`;
do not combine older ZIPs. The single archive has
node_app, web_root, LIVE_DB_UPDATE.sql and its deployment guide. web_root replaces
the former duplicate public_html/domain_root payloads; retain cloud routing and
startup configuration. Superseded archives, extracted copies and loose staging
files were removed from `release/` at the user's request. The retained archive is
the single timestamped ZIP in that folder; its embedded manifest contains the
release identity and file checksums.

Registry rows, metrics and an open item profile refresh every 15 seconds while
visible. Installation form saves invalidate shared inventory queries. This fixes
stale screens after assignments performed in another view/session without
rewriting lifecycle data. QR previews and printable PDFs no longer include the
"Registered in Riana CIMS" footer; safe history links remain unchanged.

This rebuild includes the serial assignment fix: exact client/branch/department
assignments without an installation ID are recognized. Explicit links to other
installations do not receive this fallback. Subsidiary restrictions and serial
eligibility remain unchanged. See SERIAL_ASSIGNMENT_ACCESS.md in the package.
No assignment records are rewritten and no new columns are needed for this fix.
The SQL preflight now also checks client_assignments and the existing hierarchy
and technician fields used by the packaged guard. If these are missing, apply the
existing client branch/department migrations before retrying; stop on errors.

All equipment, including kiosks, is optional by default. Serial Required is configured per subsidiary; existing explicitly configured settings are retained. Inventory Officer, Admin and Teamlead edit their own subsidiary, while SuperAdmin edits all. Required quantities are enforced on technician saves and completion. Optional devices can omit a serial; supplied serials still require valid mapping, scope and eligibility.

QR labels contain only a same-origin URL and an opaque asset ID. Scanning opens a public verification page without login, showing only the serial, model/family, current lifecycle status and redacted lifecycle timestamps. It never returns people, client/branch, location, manufacturer identity, internal IDs, files, notes, technical configuration or raw audit metadata. Signed-in inventory users retain the existing scoped record and full audit-history permissions. Legacy `?hardware=<asset-id>` labels redirect to the public view for signed-out scanners. Foreign-origin scan URLs and embedded credentials are not navigated. Generate labels on the HTTPS cloud origin for use outside the local workstation.

Production PRIVATE_UPLOAD_ROOT and LEGACY_UPLOAD_ROOT must resolve outside the application folder. Legacy reads fall back to the old server/uploads directory without moving or deleting files; new production legacy uploads use the external configured directory. Existing symlinks and runtime environment values must be retained during an overlay. Run node server/scripts/verify-external-storage.cjs in the cloud runtime environment before deployment. The local checkout currently has no external upload roots configured; this does not verify the remote cloud folders.

Derived Vite caches were cleared and both CIMS and Developers were rebuilt. A release-specific browser cleanup removes only RIANA/workbox application caches and relevant same-origin service workers on the next page load. Cookies, authentication storage and unrelated cache entries are retained. Browser automation could not attach to the existing user browser because the Windows sandbox failed; it did not clear unrelated browser data.

Build the overlay with node scripts/build-cloud-inventory-patch.cjs after npm run build:all. Output includes node_app, web_root, LIVE_DB_UPDATE.sql, DEPLOYMENT.md, MANIFEST.json and a ZIP SHA-256. Uploads, private files, secrets, backups, node_modules and test files are excluded. This is the current workspace runtime snapshot, including its integrated pre-existing changes; it is not a patch against an inspected cloud version.

The SQL preflight checks existing parent tables, ID types and collations, preserves custom role enum values/defaults, adds the hardware schema and requirement table without resetting counters, and records migration IDs. No database name is hardcoded and no clean-install/customer-data dump is included. It is tested twice against an isolated existing schema with unchanged records, and against an old role enum with an extra custom role and default. DDL requires an appropriate live database account and a verified backup before execution. On a preflight error, stop and review rather than changing parent keys automatically.

Rollback restores the prior application and dependency lockfiles while retaining issued serials, new tables, history and upload folders. Remote deployment and live SQL execution are separate actions and were not performed by package creation. Existing Chat/Finance type-check errors and previously reported dependency audit findings remain.
