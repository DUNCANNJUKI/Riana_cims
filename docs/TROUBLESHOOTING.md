# Troubleshooting

## Blank page

Check that `npm run build:all` succeeds, `/api/health` responds, and the deployed root contains the latest `dist`. Inspect the first browser console error. A missing `/developers` iframe is no longer a dependency because CRMS is compiled into the root application.

## Login loops or immediate logout

Verify server time, `JWT_SECRET`, database connectivity, account `is_active`, and session version. Clear stale RIANA site storage after an environment/secret migration.

## Email or SMS failure

Run the mock provider verification, confirm `BREVO_FROM_EMAIL=info@riana.co`, authorized Brevo IP/domain, SMS balance, normalized Kenyan phone number, and provider response. Developers request lifecycle emails/SMS are sent by the backend route after create, approval, assignment, and status updates; messages should include a `/developers/requests/{id}` system URL. Never print API keys to logs.

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
