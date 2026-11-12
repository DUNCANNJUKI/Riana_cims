# Production passkey enrollment recovery

The reported failure occurs while adding a passkey on `https://rianacims.marezi.co`. A working fingerprint/face prompt establishes device availability; enrollment still needs a correctly configured server, the WebAuthn schema and successful verification. Public API health alone does not verify enrollment.

## Diagnose without changing accounts

From the deployed application directory, run this read-only check with the API's environment loaded:

```sh
NODE_ENV=production node server/scripts/verify-passkey-readiness.cjs --origin https://rianacims.marezi.co
```

The script loads the same root `.env.local` as the API, preserving inherited environment values. If PM2 injects configuration separately, run with that same environment. Exit 0 means configuration, dependency loading and required schema columns passed; exit 1 means a check failed. Output contains configured public origin/RP ID and schema column names, never passwords, credential IDs, public keys, challenges or account data. It does not enroll a credential, modify schema or authenticate an account.

| Code | Recovery |
| --- | --- |
| `PASSKEY_CONFIGURATION_REQUIRED` | Correct the deployed API environment and restart its existing managed process. Confirm the host matches the browser URL. |
| `PASSKEY_MIGRATION_REQUIRED` | Verify a pre-change database backup, then apply the additive account-security migration through the deployment runner. |
| `PASSKEY_DEPENDENCY_UNAVAILABLE` | Restore locked API dependencies with `npm --prefix server ci --omit=dev` using the supported Node runtime. |
| `PASSKEY_DATABASE_UNAVAILABLE` | Investigate API database connectivity and metadata permissions without sharing credentials. |
| `PASSKEY_READINESS_CHECK_FAILED` | Check command arguments, production database environment and runtime availability on the host. |

For the Marezi deployment, configure:

```dotenv
WEBAUTHN_ORIGIN=https://rianacims.marezi.co
WEBAUTHN_RP_ID=rianacims.marezi.co
WEBAUTHN_RP_NAME=RIANA CIMS
```

Do not copy another deployment's domain into these values. Passkeys are scoped to the relying-party domain; credentials enrolled on a different RP ID may require separate enrollment. Keep current-password verification, HTTPS, user verification and single-use session-bound challenges enabled.

## Deployment and schema

The deployment runner now includes `20261101_passkeys_and_account_security.sql`. It creates `webauthn_credentials` and `webauthn_challenges` with user foreign keys and active-credential/challenge indexes. Existing credentials and account records are retained; the migration uses `CREATE TABLE IF NOT EXISTS`. Incomplete existing tables fail the column check and need a reviewed additive repair rather than being silently accepted.

The normal production helper verifies a database backup before migrations, checks passkey readiness before updating the release marker or restarting PM2, and then verifies the running release. A passkey readiness failure stops deployment before restart. Diagnose and correct it, then rerun deployment; do not bypass the gate. This does not make installation of dependencies or MySQL DDL transactional.

## Confirm the actual fix

1. Record the authenticated registration-options/registration-verify response status and safe `code` from browser Network tools. Do not share passwords, cookies, authorization headers, challenge responses or credential identifiers.
2. Run the host readiness command and resolve its failures.
3. Deploy the reviewed commit and verify its full SHA through `/api/health`.
4. In Account Settings, use the current password to add a new passkey, complete the device prompt and confirm the new entry appears.
5. Sign out and use that passkey to sign in, completing any required MFA. Confirm an authenticated session and expected account access.

Chromium virtual-authenticator tests validate the software cryptographic path; these final steps validate the physical device, actual production session and MFA. A successful readiness check alone does not certify them.

## Rollback

Revert the application changes, rebuild the frontends and restore the preceding release through the managed deployment procedure. Retain the additive tables and their data: dropping them destroys enrolled passkeys. Keep password sign-in available. Restore database backups only through the established recovery process with an explicit assessment of writes since the backup.
