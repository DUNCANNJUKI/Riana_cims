# Administrator Guide

## Users and access

Create users with the least module role required. Password changes and role/status changes invalidate older sessions. Review the audit trail after privilege changes. Do not share administrator accounts.

## Notifications

Account creation, assignment, password, approval, and handover workflows create in-app notifications and can dispatch email/SMS to database-derived recipients. Sender email is configured as `info@riana.co`. Use provider test recipients only in a controlled test environment.

## Backups

Only SuperAdmin can view backup status, change the schedule, list backups, or start a manual backup. Confirm the latest run is successful and non-empty. The application has no backup-delete endpoint. Before upgrades, create and verify a backup and document its filename.

## Branding and documents

Maintain the canonical logo, primary teal, neutral text colors, and subsidiary contact information in company settings. Reports use these shared values so headings, tables, watermark, and footer remain readable.

## Release procedure

Back up, apply migrations, build both clients, restart the managed API process, check `/api/health`, test login for each role, test a read and approved write per module, preview/download a handover, and inspect notification and backup status.
## SuperAdmin authority

SuperAdmin is the platform-wide RIANA CIMS authority across CIMS and Developers/CRMS. It is the only role allowed to manage company settings, open/create database backups, delete users, change Admin/SuperAdmin accounts, and grant extra Developers workspace roles from the main CIMS Users module.

On server startup, intended SuperAdmin records are normalized so the base role, active status for the bootstrap account, and CIMS/CRMS SuperAdmin module grants remain aligned. This protects the platform from stale role/designation drift after imports or restores.

Admins may create and maintain non-privileged operational users, but they cannot create Admin/SuperAdmin accounts, delete users, manage company settings, open backups, or grant privileged/module roles.

CRMS/Developers no longer manages users. It can read active profiles for assignments, audit filters, and workflow context, while all role changes remain in CIMS.

Bootstrap note: use the `admin:ensure-superadmin` script with `SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD` environment variables to create or rotate the dedicated SuperAdmin account without committing credentials.
