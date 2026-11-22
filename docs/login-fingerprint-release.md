# Transparent login fingerprint and production preparation

22 November 2026, Africa/Nairobi

The login fingerprint's white button fill, outline border and shadow obscured the intended transparent appearance. The scoped CSS correction removes those decorations in normal and hover states, enlarges the teal fingerprint from 25px to 32px, and keeps the existing 62px minimum touch target, disabled state, loading spinner and passkey handler. Keyboard focus uses a visible teal outline. Obsolete hover-fill/shadow declarations and unused transition properties were removed. No authentication code or other UI component was refactored.

Safe cleanup is confined to these affected CSS rules. Runtime data, credentials, uploads, backups, source history and local QA evidence are preserved. Bulk generated screenshots remain local and are excluded from the release commit.

This release also includes the previously prepared PWA startup fix and the prior responsive/client-implementation commit. Release inspection found that the existing production migration runner did not list the additive feedback migration. The runner now includes it after the original client-portal migration and verifies all three columns. The SQL also registers its migration history idempotently, matching the existing runner's contract. The established deploy script verifies a database backup before applying migrations and restarting the managed API. No additional production database operation is performed outside that process.

Validation:

- CIMS and CRMS production builds; TypeScript checks; full regression suite: 241 passed, two existing integration skips.
- Root and CRMS lint: no errors; root retains 206 existing warnings, CRMS has none.
- Actual local login browser checks at 320, 390, 768, 1366 and 1920px: transparent normal/hover states, no shadow or horizontal page overflow, 32px visible icon and preserved touch target. Keyboard focus, empty-email passkey validation, password visibility toggle and recovery-dialog open/cancel pass without sign-in or message delivery. A test-only obsolete autocomplete selector was corrected to the existing password field id; application input attributes were not changed.
- Disposable local database migration validation: preserved a historical synthetic acceptance, created nullable feedback columns and exactly one migration-history row after two runs; only the disposable schema was removed afterwards.
- Final-build PWA validation: Chromium manifest parsing and online/offline production worker icon retrieval pass. Native Android startup and physical passkey hardware remain outside browser emulation coverage.

The prior production release observed before publishing was `bac341d83ffc73ffb4251f2107a172cb0eb9c7bc`. GitLab `main` triggers the established production pipeline. A Git push is not deployment verification: production health must report the expected new full SHA, and served login/PWA assets must match. Available Git credentials permit repository operations but GitLab API pipeline inspection returned 403 `insufficient_scope`; no connected browser session was available as a fallback.

Rollback: restore the last verified production application release using the normal deployment process. Retain the additive nullable feedback columns and migration history to preserve captured feedback; do not drop them. For only the fingerprint styling, restore the prior passkey CSS rules and rebuild. No login/session data cleanup is required.
