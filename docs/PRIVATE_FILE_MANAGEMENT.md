# Private File Management

## Architecture

User selects file -> frontend performs basic checks -> backend authenticates the session -> backend checks file permission and related-record access -> file is accepted into private temporary storage -> backend validates filename, size, extension, and magic bytes -> backend generates a UUID filename and SHA-256 checksum -> image variants are created when `sharp` is installed -> file moves to permanent private storage -> MySQL stores metadata only -> audit log records the event -> frontend receives a file ID and safe metadata -> later view/download requests stream through authorized backend endpoints.

## Storage

Set these variables in `.env.local` or the production environment:

```env
PRIVATE_UPLOAD_ROOT=/home/account/private_uploads
MAX_IMAGE_UPLOAD_MB=8
MAX_DOCUMENT_UPLOAD_MB=20
MAX_MESSAGE_ATTACHMENT_MB=10
FILE_RETENTION_DAYS=30
FILE_BACKUP_ROOT=/home/account/private_file_backups
```

`PRIVATE_UPLOAD_ROOT` must be outside `public`, `public_html`, `dist`, `build`, and server public folders. Production startup fails if it is missing. The Node process must be able to read/write the directory, but do not use `chmod -R 777`; use the hosting account user/group with restrictive permissions.

## Database

Apply:

```powershell
cmd /c npm run db:migrate
```

or import `server/migrations/20260715_private_file_management.sql` in phpMyAdmin after a verified backup. MySQL stores only metadata and relative paths in `uploaded_files` and `uploaded_file_variants`.

## Endpoints

- `POST /api/files/upload`
- `GET /api/files`
- `GET /api/files/:id`
- `GET /api/files/:id/view`
- `GET /api/files/:id/download`
- `DELETE /api/files/:id`
- `POST /api/files/:id/restore`
- `POST /api/files/:id/replace`
- `GET /api/files/admin/storage-summary`

Responses do not expose absolute paths, relative paths, stored filenames, or checksums.

## Operations

Inspect before deleting anything:

```powershell
cmd /c node server/scripts/inspect-file-storage.cjs
```

Back up private uploads:

```powershell
cmd /c node server/scripts/backup-private-files.cjs
mysqldump -u DB_USER -p DB_NAME > backup.sql
tar -czf uploads-backup.tar.gz /path/to/private_uploads
```

If hosted E-Handover preview or download shows a missing-file error, run the inspection script on the hosted Node app. Check `counts.missingLegacyHandovers` and `missingLegacyHandovers`. Those records point to database rows whose legacy files are absent from `server/uploads`; restore that uploads backup with the matching database backup, or re-upload the signed handover document.

Recommended retention: 7 daily backups, 4 weekly backups, and 3 monthly backups. Restore both MySQL metadata and `private_uploads` together to a test location before production restore.

## Migration From Legacy Uploads

Current legacy locations include `server/uploads`, `handover_uploads.file_path`, `user_profiles.avatar_url`, `company_settings.logo_path`, and chat `messages.attachment_file_path`. Do not delete those files yet. Use the inspection script to build a migration report, copy files into private storage, verify checksums, update references in a controlled transaction, and keep a rollback mapping.

The legacy `/uploads`, `/api/upload`, `/api/download`, `/api/auth/avatar`, and chat attachment paths remain in place for backward compatibility until each module is migrated to `/api/files`.

## Rollback

1. Stop new uploads.
2. Restore the previous application release.
3. Keep `PRIVATE_UPLOAD_ROOT` unchanged; do not delete files.
4. Restore MySQL from the matching backup if metadata migration caused issues.
5. Re-enable legacy upload routes if a screen has not been migrated.
