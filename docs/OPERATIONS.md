# Operations runbook

## Backups

- Schedule: Admin settings, stored in `company_settings.backup_schedule`.
- Default: daily at 02:00 in `Africa/Nairobi`.
- Files: `server/backups/` (ignored by Git).
- Manual proof: `npm run db:backup:verify`.
- API status: `GET /api/admin/backup-status`.

A successful verification must report a non-zero size and table count. Restore into a disposable database first and validate users, clients, installations, assignments, and `crms_*` records before any production restore.

## Email and SMS

Mock wiring check (no external messages):

```bash
npm run notifications:verify
```

Explicit live delivery check:

```bash
npm run notifications:test-live -- --confirm=live --email=recipient@example.com --phone=0712345678
```

Brevo must authorize the production server IP and verify `info@riana.co`. B-Textman returns a provider message ID/status; `queued` means accepted for downstream delivery, not handset confirmation.

## Incident checks

1. `GET /api/health` returns `status: ok`.
2. `npm run db:verify-unified` reports `unified: true` and zero orphans.
3. PM2/Docker logs show one backup schedule registration.
4. `/` and `/developers/` render without console errors.
5. A Developer login opens the Developers workspace automatically.

## Document-branding release check

1. Generate one RIANA and one MAREZI client document, including a multi-page case.
2. Confirm a MAREZI client/request or a MAREZI generating user selects MAREZI document identity; all other combinations retain RIANA.
3. Confirm the MAREZI letterhead is present unchanged on every page and the footer shows confidentiality, generation date, and `Page X of Y`.
4. Confirm RIANA continuation pages use the compact teal header and graphical footer without covering content.
5. Confirm CIMS and Developers downloads use the same page geometry and footer convention.
6. Confirm each report name appears only once in the branded header and is not repeated as a black body heading.

For a Developers notification smoke test, submit a request for approval, assign it, and complete it using test accounts with controlled contact details. Verify one in-app record plus one email/SMS attempt per intended recipient at each event, and verify completion targets the assigning user rather than the client contact.

The 2026-06-27 role release uses `server/migrations/20260627_enterprise_roles_permissions.sql`. It extends the role enum, creates direct user grants, seeds Finance/Management roles, and extends company settings without removing data. Apply it after a verified backup. The rollback converts Finance/Management users to User before narrowing the enum.

Role or direct-grant changes increment `session_version`; affected users must sign in again. This is intentional privilege-cache invalidation.

Rollback for branding-only assets remains code-and-asset only. Role/schema rollback must use the documented rollback migration after a verified backup.
