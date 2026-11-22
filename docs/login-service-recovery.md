# Local login service recovery

Date: 2026-11-21 (Africa/Nairobi)

## Cause

The login toast reported that the service was temporarily unavailable. API logs showed `ER_BAD_DB_ERROR: Unknown database 'riana_cims'` during startup, maintenance checks, scheduling and login. A successful `/api/health` response alone did not establish database readiness.

The MySQL instance initially serving port 3306 used `C:\xampp\mysql\data` and contained `qsys_db`, but no CIMS database. The original CIMS files were found under `C:\xampp\mysql_master\data`; their log recorded a clean shutdown on November 20.

## Recovery and preservation

- Copied the preserved data directory into the ignored `.runtime/database-recovery-20261121/data` before recovery work, leaving the source untouched.
- Started that copy with the matching MariaDB 10.4.32 binary on loopback port 13317, with read-only mode enabled, events disabled and replication startup disabled.
- During investigation, the external MySQL directory state changed: the original data directory returned to `C:\xampp\mysql\data`, `mysql_master` disappeared and `mysql.qms` appeared. This agent did not rename those directories or switch the Windows MySQL service.
- Rechecked the live database before any import. Both the live database and isolated copy contained 98 tables, 3 users, 3 clients and 6 installations. The affected account was present and active. Extended checksums matched for `user_profiles`, `clients` and `installations`.
- No import, database replacement, password change, permission change or authentication bypass was performed.
- Shut down the temporary recovery instance cleanly and restarted only PM2 applications `riana-cims` and `riana-cims-web`. The recovery copy remains in the ignored runtime directory as a safety snapshot; no temporary database listener remains on port 13317.

## Validation

- API startup log: `Database initialization complete`; backup schedule initialized.
- HTTP 200: API health on port 8081, web page on port 8090, proxied maintenance status and public company branding.
- `npm.cmd run db:verify-unified`: passed; expected core/CRMS tables and role definitions present, with no orphan client or assignee references.
- Playwright isolated browser: loaded the real local login page, submitted a deliberately invalid nonexistent test account, received HTTP 401 `Invalid credentials`, and observed the expected credential-error toast. No service-unavailable error or uncaught page exception occurred.
- Existing-user successful login, physical passkeys and MFA were not exercised with the user's credentials. The user can retry their existing credentials.

## Support and rollback

If this recurs, check the actual database names and `@@datadir` on the configured MySQL port before changing application code or creating databases. Do not replace the live directory with another project's MySQL directory or copy individual InnoDB table files into an unrelated instance.

No application configuration or authentication code changed for this recovery. There is no code rollback or migration rollback. Preserve the live data and the safety snapshot; any future data restoration must be assessed separately and must not overwrite a populated database without a current backup.
