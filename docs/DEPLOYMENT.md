# Deployment

## Before deployment

1. Copy `.env.example` to `.env.local` and set production values.
2. Configure authenticated domain SMTP with `mail.rianacims.name.ng:465`, `SMTP_SECURE=true`, and sender `info@rianacims.name.ng`. Store the mailbox password only in the private runtime environment.
3. Point `DATABASE_*` at the single `riana_cims` database.
4. Run the verification commands from the README.

## PM2 deployment

```bash
npm ci
npm ci --prefix CRMS
npm ci --prefix server
npm run build:all
npx pm2 start ecosystem.config.cjs
npx pm2 save
```

The process listens on port 8081 and serves both SPAs. Put HTTPS Nginx/Apache in front of it. An Nginx starting point is provided in `hosting/nginx.conf.example`.

## Docker deployment

```bash
docker compose --env-file .env.local up -d --build
docker compose ps
curl http://localhost:8081/api/health
```

MySQL data uses a named volume. Backups and uploads are bind-mounted so they survive container replacement.

## Updating

Pull the requested commit, install locked dependencies, rebuild both SPAs, restart the one application process, verify `/api/health`, then run a manual backup. Never copy `.env.local` into a public web root.

## Truehost cPanel deployment

Generate the upload-ready package with:

```bash
npm run build:truehost
```

For an authorized migration that must preserve the current active SuperAdmin and password, opt in explicitly:

```powershell
$env:HOST_EXPORT_PRESERVE_SUPERADMIN='1'
npm run build:truehost
Remove-Item Env:HOST_EXPORT_PRESERVE_SUPERADMIN
```

This mode exports only the SuperAdmin account and its existing bcrypt hash; it never writes the plaintext password. Treat the generated SQL and database archive as secrets and never place them in `public_html`. The default build remains an inactive, passwordless bootstrap export.

The generated `Truehost/` directory is aligned to the production cPanel setup:

- `domain_root/.htaccess` must be uploaded to `/home/lxvtrfta/rianacims.name.ng/.htaccess` before **Start App**; CloudLinux reads this file before adding Passenger directives.
- `app/` maps to `rianacims.name.ng/app` and contains `passenger_app.js`, the API, both compiled frontends, production dependencies, and the environment template.
- The Passenger entry and core database configuration accept `DATABASE_PASSWORD`, `DB_PASSWORD`, or Truehost's `DB_PASS` variable. Do not define conflicting values.
- `public_html/` contains browser-safe compiled assets only.
- `database/riana_cims_host.sql` imports into the database selected in phpMyAdmin and never creates or switches databases.
- `TRUEHOST_DEPLOYMENT.md` contains the ordered upload, import, SuperAdmin handling, verification, and rollback procedure.

The default database export contains one inactive, passwordless `superadmin@riana.co` bootstrap principal. Activate it once with `npm run admin:ensure-superadmin` while temporary `SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD` environment variables are present. Remove both variables before the final restart so future restarts cannot reset the password. In explicit preserve mode, the active SuperAdmin and bcrypt hash are imported directly, so do not set bootstrap variables unless intentionally rotating the password.
