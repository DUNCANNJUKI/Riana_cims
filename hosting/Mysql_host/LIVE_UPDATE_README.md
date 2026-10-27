# Hosting Database Files

For an existing cloud database, use only `LIVE_DB_UPDATE.sql` from the release
in the single consolidated ZIP in `release/`. Its sibling copy in this directory
is refreshed from that verified package. Do not combine it with older migrations.
Back up the live database first, stop on SQL errors and follow the package's
`DEPLOYMENT.md`. The migration retains operational data and is repeatable.

`riana_cims_host.sql` is a sanitized **clean-install-only** schema/reference dump.
It contains DROP TABLE statements and must never be imported over a live database.
It is not a live database backup and contains no usable bootstrap password.

Deploy the matching release's `node_app/` and `web_root/` overlays. On the shown
live layout, overlay `web_root/` into `rianacims.name.ng`; preserve
`riana_private_file_uploads` and `riana_private_uploads` as external upload
folders. Older hosting ZIPs are not the current inventory release. Keep
environment files, routing, startup wrappers and external upload folders unchanged. Production requires
configured external `PRIVATE_UPLOAD_ROOT` and `LEGACY_UPLOAD_ROOT`; local default
development folders are not evidence that cloud storage is configured. This local
installation now uses D:\riana-cims-data; do not copy that Windows path into the
cloud environment.
