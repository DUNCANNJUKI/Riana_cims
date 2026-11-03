# Account security, passkeys, and secure app lock

## Architecture

Riana CIMS keeps password, MFA, passkey, and session authorization on the API. WebAuthn uses `@simplewebauthn/server` for attestation/assertion verification and `@simplewebauthn/browser` only to invoke the browser credential APIs. The server stores credential IDs, public keys, counters, transports, device metadata, and timestamps. It never receives or stores fingerprint, face, or other biometric templates.

Registration requires an authenticated session plus the current password. Its challenge is bound to the user, current session, origin, RP ID, purpose, and five-minute expiry. Authentication challenges are user-bound, origin/RP-bound, single-use, and counter-checked. A successful assertion issues the normal CIMS session and still invokes mandatory MFA when enabled.

## Configuration

- Development: localhost derives its origin and RP ID from the request and uses browser-supported localhost WebAuthn behavior.
- Staging/production: set `WEBAUTHN_ORIGIN` to the exact HTTPS application origin and `WEBAUTHN_RP_ID` to the reviewed relying-party domain. Set `WEBAUTHN_RP_NAME` only to change the display name.
- Do not use wildcard origins or embed secrets in frontend environment variables.

## MFA, recovery, and passwords

Password mutation verifies the current password on the same protected endpoint and applies the configured password hash. MFA changes require the current password. Email/SMS enrollment persists only after confirmation; merely saving a destination is not enrollment.

Authenticator-app enrollment uses standards-based TOTP. The server generates the secret, encrypts it with AES-256-GCM, and activates it only after a valid code. Set `MFA_ENCRYPTION_KEY` to a dedicated 32-byte base64 or 64-character hexadecimal key in staging and production; production fails closed when it is absent. The QR code and manual secret are returned only during enrollment and are never logged.

Recovery codes are generated from cryptographically secure random bytes. Only keyed SHA-256 hashes are stored. Redemption is transactional and one-use, and regenerating codes invalidates the previous set. Displayed recovery codes must be stored by the user when generated because they cannot be retrieved later.

## App lock and sessions

Manual, inactivity, and configured resume locking persist a restricted state for the current backend session. A locked session receives HTTP 423 on protected APIs; only password/passkey unlock, session-status, and logout routes remain available. The lock overlay makes the authenticated shell inert, coordinates tabs, and immediately stops active call media. Password and same-account passkey unlock restore the existing authorized session; logout remains a separate revocation action. Offline unlock fails closed.

Profile display-name edits are authenticated, normalized, validated, and audited. Email and phone changes require the current password plus a short-lived, single-use verification code delivered to the proposed destination. Email changes increment session version and revoke existing sessions. Production fails safely when the required delivery provider is unavailable.

Interface preferences are server-owned and include English, light/dark/system theme, inactivity timeout, and lock-on-resume. English is the only supported language in this release; the UI does not imply otherwise.

## Settings interface

Account Settings now exposes three primary workspaces: My Profile, Security & Sign-in, and Preferences. Security & Sign-in presents password, MFA/recovery, passkeys, and devices/sessions/app-lock as compact management rows and renders only the selected complex workflow. Current-password fields remain scoped to the sensitive operation that requires them; the reauthentication endpoints, WebAuthn ceremony, MFA enrollment, session revocation, app-lock enforcement, rate limiting, and audit behavior are unchanged. The dialog uses an internally scrolling body so its header and three-tab navigation remain usable from 320px through desktop widths.

## Database migration

`20261101_totp_recovery_and_preferences.sql` was applied successfully to the configured local development database on 2026-11-01. It adds TOTP credentials, recovery codes, MFA login challenges, interface preferences, session locks, and verified identity-change requests. Apply it to staging only after backup/restore verification. The rollback companion is intentionally data-destructive for these new tables and must not be run without explicit authorization and a verified backup. No staging or production migration was applied.

## Staging acceptance

- Validate registration and sign-in on Windows Hello, Android, iOS/macOS, and a roaming security key where supported.
- Verify expired challenges, reused assertions, wrong origins/RP IDs, revoked credentials, disabled accounts, mandatory MFA chaining, session replacement, and current-session revocation.
- Verify TOTP clock windows and replay rejection, one-use recovery codes, recovery-code regeneration, locked API denial, password/passkey unlock, cross-tab lock, inactivity/resume lock, and media teardown.
- Verify email and phone changes with real non-production delivery providers, including wrong/expired codes, duplicate destination, session revocation, and previous-address security notice.
- Confirm light/dark and responsive Account & Security layouts, and verify that app lock releases or terminates privacy-sensitive active media according to the approved product policy.

Physical authenticator testing and production HTTPS/RP configuration remain pending; compilation and unit tests are not substitutes for this acceptance.
