# RIANA CIMS - Truehost deployment

This package is aligned to the cPanel configuration shown for **rianacims.name.ng**:

- Node.js: **24.15.0**
- Mode: **Production**
- Application root: **rianacims.name.ng/app**
- Application URL: **https://rianacims.name.ng/**
- Startup file: **passenger_app.js**

No live credentials, customer records, uploads, logs, runtime secrets, or backups are included.

## Folder mapping

- Upload `Truehost/domain_root/.htaccess` to `/home/lxvtrfta/rianacims.name.ng/.htaccess` before starting the app. CloudLinux requires this file to exist and will maintain its Passenger directives.
- Upload the **contents** of `Truehost/app/` into `/home/<CPANEL_USER>/rianacims.name.ng/app/`.
- Upload the **contents** of `Truehost/public_html/` into the domain's `public_html/` only when the Truehost domain document root uses that folder. The Node application already serves the same build from `app/dist/`.
- Import `Truehost/database/riana_cims_host.sql` into the selected cPanel MySQL database.

Do not upload the `database` folder, `.env.local`, or any SQL file to `public_html`.

## Clean installation

1. In cPanel, create a MySQL database and user, grant that user **ALL PRIVILEGES** on only this database, and note the cPanel-prefixed names.
2. In phpMyAdmin select that database, then import `database/riana_cims_host.sql`. The SQL intentionally does not create or switch databases and avoids function-based UUID/DATE defaults that older shared-host MySQL releases reject.
3. Upload `domain_root/.htaccess` to `/home/lxvtrfta/rianacims.name.ng/.htaccess` before using **Start App**. Ensure the filename remains exactly `.htaccess`; do not place it inside `app` or `public_html`.
4. Upload `app/` as mapped above. Copy `app/.env.example` to `app/.env.local`; replace every placeholder. Generate a unique JWT secret of at least 48 random characters. Configure `SMTP_PASSWORD` with the private mailbox password for `info@rianacims.name.ng`; keep `SMTP_HOST=mail.rianacims.name.ng`, `SMTP_PORT=465`, and `SMTP_SECURE=true`. Configure `B_TEXTMAN_API_KEY`, `B_TEXTMAN_API_URL`, `B_TEXTMAN_SEND_PATH`, and `SMS_SENDER_ID` with the same working values used by the approved SMS gateway. Confirm `CIMS_LOGIN_URL=https://rianacims.name.ng/` and `CORS_ALLOWED_ORIGINS=https://rianacims.name.ng` are present in either that file or the cPanel Node environment. Existing cPanel setups may use `DB_PASS`; it is accepted as the database-password alias.
5. In **Setup Node.js App**, keep Node.js **24.15.0**, **Production**, application root `rianacims.name.ng/app`, root application URL, and startup file `passenger_app.js` exactly as shown.
6. Click **Run NPM Install**. It must complete without errors. Do not upload a local `node_modules` folder.
7. Create writable private directories `app/server/uploads` and `app/server/backups`; keep them outside `public_html`.
8. Activate the bootstrap SuperAdmin once: temporarily add SUPERADMIN_EMAIL (default superadmin@riana.co) and a unique SUPERADMIN_PASSWORD in the Node app environment. The password must be 14+ characters with upper-case, lower-case, number, and symbol characters. In the application terminal run npm run admin:ensure-superadmin. Immediately remove both temporary variables before the final restart.
9. Use **Restart** in **Setup Node.js App**, then open `https://rianacims.name.ng/api/health`. It must return `{"status":"ok",...,"corsPolicy":"same-origin-host-v1"}`; if the marker is absent, Passenger is still serving the previous backend. Then sign in and change/verify the SuperAdmin password, verify the dashboard, Developers workspace, reports, uploads, email, and SMS.

The imported database contains one inactive, passwordless SuperAdmin bootstrap principal. It cannot authenticate until step 8 securely activates it. No universal/default password exists in this package.

## Update or rollback

For an existing live database, first back up the database, then select it in phpMyAdmin and import LIVE_DB_UPDATE_20260705.sql before uploading or restarting the new application. The update is idempotent, adds only the nullable subsidiary equipment-configuration column, preserves all rows, and records itself in migration_history. Do not import the clean-install riana_cims_host.sql over a live database.

Before an update, back up the database and the current `app` folder. Preserve the production `.env.local`, uploads, backups, and any Truehost-managed `.htaccess`. Upload the new app files, run NPM Install, restart, and execute the smoke tests. To roll back, restore the previous app folder and its matching database backup.

## Security checks

- Force HTTPS; the production session cookie is Secure, HttpOnly, and SameSite=Strict.
- Publish exactly one DMARC TXT record at `_dmarc.rianacims.name.ng`; multiple policies invalidate DMARC evaluation.
- Never expose `.env.local`, SQL, backups, logs, or uploads in `public_html`.
- Store the SMTP mailbox password only in the private Node environment; never add it to an upload archive or public file.
- Restrict the database user to the application database and rotate credentials after staff changes.
- Keep the SuperAdmin bootstrap variables only for the one activation restart.
- Compare uploaded files with `FILE_MANIFEST.sha256` when diagnosing corruption.
