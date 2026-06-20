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
