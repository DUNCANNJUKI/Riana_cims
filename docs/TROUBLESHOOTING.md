# Troubleshooting

## Blank page

Check that `npm run build:all` succeeds, `/api/health` responds, and the deployed root contains the latest `dist`. Inspect the first browser console error. A missing `/developers` iframe is no longer a dependency because CRMS is compiled into the root application.

## Login loops or immediate logout

Verify server time, `JWT_SECRET`, database connectivity, account `is_active`, and session version. Clear stale RIANA site storage after an environment/secret migration.

## Email or SMS failure

Run the mock provider verification, confirm `BREVO_FROM_EMAIL=info@riana.co`, authorized Brevo IP/domain, SMS balance, normalized Kenyan phone number, and provider response. Never print API keys to logs.

## Backup failure

Check database credentials, write permissions for the backup directory, free disk space, cron expression, and last-run error. Run the verified manual backup command and restore into a disposable database before declaring recovery healthy.

## Handover file failure

Confirm an allowed file type/size, a database handover row for the installation, and authenticated access. Reject paths that resolve outside the upload directory.

## Incorrect satisfaction

Inspect source ratings. Only numeric 1–5 values enter Average Rating/CSAT. CSAT counts 4 and 5 as satisfied. Recommendation 0–10 values belong to NPS and must not be mixed into CSAT.
