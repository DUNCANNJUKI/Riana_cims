# Administrator Guide

## Users and access

Create users with the least module role required. Password changes and role/status changes invalidate older sessions. Review the audit trail after privilege changes. Do not share administrator accounts.

## Notifications

Account creation, assignment, password, approval, and handover workflows create in-app notifications and can dispatch email/SMS to database-derived recipients. Sender email is configured as `info@riana.co`. Use provider test recipients only in a controlled test environment.

Developers approval, assignment, and completion events are server-dispatched to prevent browser-side duplication. Sales receives pending-approval alerts, the selected developer receives assignment alerts, and the user who assigned the work receives the completion alert. Each event records an in-app notification and attempts email and SMS delivery.

## Backups

SuperAdmin and Management can view backup status, change the schedule, list backups, or start a manual backup. Confirm the latest run is successful and non-empty. The application has no backup-delete endpoint. Before upgrades, create and verify a backup and document its filename.

## Branding and documents

Maintain the canonical RIANA logo, primary teal, neutral text colors, and subsidiary assignments in company settings. The application shell always uses RIANA identity. A generated document uses MAREZI identity when either its client/request or its generating user belongs to MAREZI; otherwise it retains the existing RIANA document path.

MAREZI documents must use `public/marezi-letterhead.png`, extracted unchanged from the approved MAREZI Word letterhead. Do not replace it with a recreated logo, recolor it, stretch it, or combine it with the RIANA watermark/footer. Every page retains the MAREZI letterhead plus the standard confidentiality, generated-date, and `Page X of Y` metadata. RIANA documents retain the official logo-matched teal, watermark, graphical footer, and continuation header.

When adding a generator, call the shared document header and branding utilities and pass both the client/request subsidiary and generating-user subsidiary to the shared resolver. Do not implement precedence between those inputs: MAREZI membership in either input selects the approved MAREZI document identity.

## Release procedure

Back up, apply migrations, build both clients, restart the managed API process, check `/api/health`, test login for each role, test a read and approved write per module, preview/download a handover, and inspect notification and backup status.
## SuperAdmin authority

SuperAdmin is the platform-wide RIANA CIMS authority across CIMS and Developers/CRMS. It manages privileged accounts and is the only role allowed to grant individual extra privileges or privileged Developers workspace roles. Direct grants are catalogued, audited, transactional, and revoke the target user's active session.

Management has broad administrative access, including company settings, subsidiaries, backups, non-privileged users, reports, and Developers administration, but is always denied installation and installation-progress writes. Finance defaults to read-only Clients, Installations, Assigned Technicians, Installation Progress, and Reports. Sales retains access to all reports.

Subsidiary deletion is blocked while any user remains attached. Finance designations are Chief Accounts, Payables, Receivables, HR, Operations, and Accounts. Management designations are CEO, MD, and Head of Sales.

On server startup, intended SuperAdmin records are normalized so the base role, active status for the bootstrap account, and CIMS/CRMS SuperAdmin module grants remain aligned. This protects the platform from stale role/designation drift after imports or restores.

Admins may create and maintain non-privileged operational users, but they cannot create Admin/SuperAdmin/Management accounts, manage company settings, open backups, or grant privileged/module roles.

CRMS/Developers no longer manages users. It can read active profiles for assignments, audit filters, and workflow context, while all role changes remain in CIMS.

Bootstrap note: use the `admin:ensure-superadmin` script with `SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD` environment variables to create or rotate the dedicated SuperAdmin account without committing credentials.
