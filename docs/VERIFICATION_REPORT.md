# Verification Report — 2026-06-21

## Passed

- Root TypeScript: `npx tsc -p tsconfig.app.json --noEmit`
- CRMS TypeScript: `npx tsc -p CRMS/tsconfig.app.json --noEmit`
- Unified root production build: 6,488 modules; PWA generated
- CRMS compatibility production build: 3,261 modules
- Security regression suite: 5/5 passed
- Mock notification/provider suite: passed with secure setup links and no plaintext password
- Unified database verification: one `riana_cims` database, 35 tables, 2 modules, 9 module roles, 10 permissions, 22 user-module grants, zero reported CRMS client/assignee orphans
- Enterprise migration: applied idempotently and recorded
- Database optimization: 35 tables analyzed; required indexes already present
- Automatic/manual backup verification: 35-table SQL, 51,181 bytes, successful
- Hosting export: `hosting/Mysql_host/riana_cims_host.sql`, 35-table schema with sanitized operational/RBAC/settings seeds
- Hosting release staged under ignored `release/`; runtime JWT secret excluded
- API integration proof on temporary production-mode server: public health 200; anonymous protected data/files 401; weak legacy JWT 401; invalid feedback 404; sensitive request 21 returned 429; authenticated upload listing/download 200
- Temporary validation port 8182 no longer has a listener

## Live activation update

- PM2 successfully started and persisted `riana-cims`; database initialization, port 8081 startup, and the `0 2 * * *` backup schedule were logged without startup errors.
- `/api/health`, `/`, and `/developers` returned 200; `/developers` used the same unified HTML entry point as `/`.
- Brevo accepted the live test email from `info@riana.co` to `bspottechnologies@gmail.com` and returned a provider message ID.
- B-Textman accepted the live SMS to `0750444167` and returned `queued`, one GSM7 part.
- Playwright reproduced the remaining blank page and showed static CSS/JavaScript asset requests receiving 403 JSON responses because global CORS was applied to same-origin assets. CORS is now scoped to `/api`; TypeScript, syntax, and 5/5 security tests pass after the fix.
- The PM2 restart needed to load the final CORS fix was rejected because the environment approval quota was exhausted. The running process still contains the pre-fix code until one restart is approved.
- The in-app browser connection could not initialize because the runtime omitted its required sandbox policy metadata; Playwright with installed Chrome was used as the documented fallback.

## Commands to complete after approval access returns

```powershell
cmd /c npx pm2 restart riana-cims --update-env
cmd /c npx pm2 save
```

After restart, verify `http://localhost:8081/api/health`, open `/`, sign in as a Developer, confirm redirect to `/developers`, and inspect the browser console while opening Requests and E-Handover preview/download.

## CRMS stability update — 2026-06-22

- Added the Vite development proxy for `/api` and `/uploads` to `localhost:8081`, resolving CRMS notification failures when the UI is opened on `localhost:8090`.
- Preloaded CRMS route chunks after the Developers workspace mounts, reducing slow first-click loading on Requests, Approvals, Assignments, Reports, Audit, and Notifications.
- Removed the duplicate CRMS welcome-banner logo so the system presents a single RIANA brand mark from the main shell header.
- Updated E-Handover preview/download to use authenticated file requests and `inline` preview disposition.
- Hardened server file lookup to safely support both current `filename.pdf` records and legacy `uploads/filename.pdf` or `/uploads/filename.pdf` references.
- Standardized NPS presentation to the globally recognized model: Promoters 9–10, Passives 7–8, Detractors 0–6, score range -100 to +100.
- Validation passed:
  - `cmd /c npx tsc -p tsconfig.app.json --noEmit`
  - `node --check server/index.js`
  - `cmd /c npm run build`
  - `localhost:8090/api/crms/notifications` returned `200` in 9 ms during browser smoke testing.
  - Existing E-Handover PDF returned `200` for both inline preview and attachment download through `localhost:8090`.
  - API server is listening on `8081`; Vite development server is listening on `8090`.

## Logo persistence update — 2026-06-22

- Fixed company logo persistence after refresh by resolving stored logo filenames to `/uploads/<filename>` before rendering.
- Added shared cache-busting logo URL handling so a newly saved logo is visible immediately and does not fall back to the bundled default image.
- Company Settings now refreshes the live header/sidebar logo after save via a local branding update event.
- Main CIMS header, sidebar, login screen, CRMS sidebar, CRMS settings preview, and CRMS loaders now use the saved company branding path instead of hard-coded asset paths.
- Validation passed:
  - `cmd /c npx tsc -p tsconfig.app.json --noEmit`
  - `cmd /c npx tsc -p CRMS/tsconfig.app.json --noEmit`
  - `cmd /c npm run build`
  - Browser smoke test confirmed the saved logo path is rendered after refresh with a valid image source and non-zero dimensions.

## Developers visual consistency update — 2026-06-23

- Aligned Developers/CRMS theme behavior with the main CIMS shell by removing leftover Vite starter CSS that could override root sizing, centering, and text alignment.
- Standardized standalone Developers theme storage to the same `theme` key used by CIMS.
- Added dark-mode status and priority tokens so badges, cards, and report indicators remain readable in dark theme.
- Updated Developers report charts to use shared CIMS CSS variables for grid lines, axis labels, card borders, and semantic colors instead of fixed light-mode colors.
- Replaced non-token blue/green/amber role-card accents with shared status/primary tokens.
- Validation passed:
  - `cmd /c npx tsc -p tsconfig.app.json --noEmit`
  - `cmd /c npx tsc -p CRMS/tsconfig.app.json --noEmit`
  - `cmd /c npm run build`
  - Browser smoke test on `localhost:8090/developers/reports` confirmed light and dark themes render with matching CIMS font, card, button, nav, chart-axis, and chart-grid colors and no Developers page error text.

## SuperAdmin, cleanup, and feedback-link update — 2026-06-23

- Centralized user/role management in main CIMS Users. CRMS profile and role mutation endpoints now return `403`; CRMS keeps read-only profile lists for assignment/audit workflows.
- Added SuperAdmin role support across API authorization, CIMS navigation, Developers workspace access, announcements, notifications, handover, assignments, analytics, imports, installations, progress, clients, company settings, backups, and database stats.
- Limited company settings, backup access, user deletion, Admin/SuperAdmin account changes, and extra Developers workspace role assignment to SuperAdmin.
- Added environment-driven SuperAdmin bootstrap script: `SUPERADMIN_EMAIL=superadmin@riana.co` and `SUPERADMIN_PASSWORD=<secret> npm run admin:ensure-superadmin`.
- Added `module_roles` so SuperAdmin can grant extra Developers workspace access without changing a user's primary CIMS role.
- Cleaned generated `logs/`, `tmp/`, and ignored `release/` contents; retained source, hosting, uploads, backups, and essential documentation.
- Trimmed documentation to the essential live set and updated README/admin/API/architecture/chatbot memory.
- Fixed feedback-link generation and preview to use the current application origin (`/feedback/<token>`) instead of client subdomains, scoped active-link reuse to the current installation, and returned complete link metadata after creation.
- Validation passed:
  - `node --check server/index.js`
  - `node --check server/routes/crms.js`
  - `node --check server/scripts/ensure-superadmin.cjs`
  - `cmd /c npx tsc -p tsconfig.app.json --noEmit`
  - `cmd /c npx tsc -p CRMS/tsconfig.app.json --noEmit`
  - `cmd /c npm run build:all`
  - `cmd /c npm run build:host` generated `hosting/Mysql_host/riana_cims_host.sql` and staged the ignored `release/` host bundle.
