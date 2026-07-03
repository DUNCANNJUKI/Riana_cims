# Troubleshooting

## MySQL reports `using password: NO`

The application did not receive a database password. Truehost commonly names this variable `DB_PASS`, while other environments use `DB_PASSWORD` or `DATABASE_PASSWORD`; current packages accept all three. Confirm exactly one contains the current cPanel MySQL user's password, ensure the database user has privileges on the selected database, save the Node application settings, and restart Passenger. `DB_HOST=localhost` is correct when MySQL runs on the same Truehost account and is not the cause of this message.

## Start App reports `FileNotFoundError` for the domain `.htaccess`

CloudLinux reads the domain document-root file before it writes or refreshes Passenger directives. Upload `Truehost/domain_root/.htaccess` to `/home/lxvtrfta/rianacims.name.ng/.htaccess`, confirm the hidden filename is preserved, then use **Start App** or **Restart** again. Do not place this file inside `app` or `public_html`, and do not hardcode `PassengerAppRoot` or `PassengerNodejs`; cPanel manages those values.

## Database import reports `#1064` near `uuid()`

The shared-host MySQL release does not support `UUID()` as a column default.
Generate a fresh package with `npm run build:truehost` and import
`Truehost/database/riana_cims_host.sql`. The host exporter removes unsupported
UUID and `CURDATE()` defaults while preserving primary keys; the API supplies
UUIDs and feedback dates explicitly on every applicable insert. Do not edit the
SQL by disabling primary keys or foreign-key definitions.

## Sign-in reports `Origin is not allowed`

This means the API is running, but its browser-origin policy rejected the login
request before authentication. For the Truehost deployment, set both
`CIMS_LOGIN_URL=https://rianacims.name.ng/` and
`CORS_ALLOWED_ORIGINS=https://rianacims.name.ng` in the private application
`.env.local` file or cPanel Node environment, then restart the Node application.
Do not add wildcards and do not place `.env.local` in `public_html`. Verify with
an `OPTIONS /api/auth/login` request carrying
`Origin: https://rianacims.name.ng`; the response must echo that exact value in
`Access-Control-Allow-Origin`.

If the error remains after uploading the corrected server, open `/api/health`.
The active backend must return `"corsPolicy":"same-origin-host-v1"`. If that
field is absent, cPanel Passenger is still running the previous application or
the files were uploaded outside the configured application root. Confirm the
root is `rianacims.name.ng/app`, replace `server/index.js` and
`server/security/apiSecurity.js`, then use **Restart** in **Setup Node.js App**.
Editing `.env.example` alone has no runtime effect; production reads the private
`app/.env.local` file or cPanel environment variables.

## Browser reports `Failed to fetch` or a localhost API URL

Production browser requests must target the deployed origin, for example
`https://rianacims.name.ng/api`, never `http://localhost:8081/api`. Run the
locked production build (`npm run build:all` or `npm run build:truehost`) and
upload the newly generated assets. When deploying to `public_html`, extract the
*contents* of `dist` there so `index.html` is directly inside `public_html`; do
not create `public_html/dist/index.html` while an older `public_html/index.html`
remains active. After deployment, restart the Node application and reload once
so the auto-updating service worker activates the new asset manifest. Do not
set `NODE_ENV=development` for a production build; the production build command
now enforces and verifies this boundary.

For local development, keep `VITE_API_URL=/api` and run the API on port 8081. Vite proxies `/api` to the API, so the application also works when opened from another LAN workstation. A hard-coded `http://localhost:8081/api` makes each remote browser call itself and produces `Failed to fetch`.

## Blank page

Check that `npm run build:all` succeeds, `/api/health` responds, and the deployed root contains the latest `dist`. Inspect the first browser console error. A missing `/developers` iframe is no longer a dependency because CRMS is compiled into the root application.

## Login loops or immediate logout

Verify server time, `JWT_SECRET`, database connectivity, account `is_active`, and session version. Clear stale RIANA site storage after an environment/secret migration.

## Email or SMS failure

Run the mock provider verification, confirm `SMTP_HOST=mail.rianacims.name.ng`, port `465`, `SMTP_SECURE=true`, sender `info@rianacims.name.ng`, mailbox authentication, TLS certificate validity, SMS balance, normalized Kenyan phone number, and provider response. A `535 5.7.8` response means the mailbox server rejected the credentials or SMTP access; it is not an application-template failure. Developers request lifecycle emails/SMS are sent by the backend route after create, approval, assignment, and status updates; messages should include a `/developers/requests/{id}` system URL. Never print SMTP passwords or API keys to logs.

DNS must publish exactly one TXT record at `_dmarc.rianacims.name.ng`. Multiple DMARC records make the policy invalid; remove obsolete provider records and consolidate reporting addresses into one approved policy.

The SMS proxy being reachable does not prove that B-Textman accepted a message. Check the private hosted values for `B_TEXTMAN_API_KEY`, `B_TEXTMAN_API_URL`, `B_TEXTMAN_SEND_PATH`, and the approved `SMS_SENDER_ID`; then inspect the provider status/message and balance. Do not run a live delivery test without an authorized controlled recipient.

## Chat is not live or users cannot receive messages

All active authenticated users are returned by `GET /api/chat/users`; inactive accounts are intentionally excluded. The live stream uses an authenticated Bearer request to `GET /api/chat/stream`. A query-string EventSource token is obsolete and will be rejected by the global API authenticator. Verify the stream returns `text/event-stream`, the receiver remains active, and the message is between 1 and 4000 characters.

## Developers access or crash

Confirm the user has an active base role or CRMS module role of `SuperAdmin`, `Admin`, `Teamlead`, `Developer`, or `Sales`. Sales users no longer require a duplicate `module_roles.crms` grant to see Developers. If the page crashes on request lists, inspect request status values; unknown statuses should render with a fallback badge instead of breaking the workspace.

## Password reset failure

For an existing active user, `/api/auth/forgot-password` creates a 30-minute reset token and sends the reset link by email and SMS when the profile has a phone number. For a missing or inactive account, the API returns `404` with `User does not exist.` Verify `CIMS_LOGIN_URL` is an absolute HTTP/HTTPS URL so reset links point to the correct system.

## Backup failure

Check database credentials, write permissions for the backup directory, free disk space, cron expression, and last-run error. Run the verified manual backup command and restore into a disposable database before declaring recovery healthy.

## Handover file failure

Confirm an allowed file type/size, a database handover row for the installation, and authenticated access. Reject paths that resolve outside the upload directory.

## Incorrect satisfaction

Inspect source ratings. Only numeric 1–5 values enter Average Rating/CSAT. CSAT counts 4 and 5 as satisfied. Recommendation 0–10 values belong to NPS and must not be mixed into CSAT.
