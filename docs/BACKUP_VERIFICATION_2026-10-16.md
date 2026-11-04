# Backup verification — 16 October 2026

## Artifact

- Source: `lxvtrfta_RianaCims (1).sql` (inspected read-only outside the repository)
- Size: 407,347 bytes
- SHA-256: `ebb4ee9ffc27f05cdc2568c62077c4fe9644a6431eaeeb4874b4190a9824f8cc`
- Dump structure: 49 unique `CREATE TABLE` statements, 39 `INSERT`
  statements, 36 foreign-key definitions, no duplicate table definitions, no
  NUL bytes, and a complete SQL terminator.

This establishes file-level integrity and structural readability. It does not
prove that every query imported successfully or that the dump represents a
transactionally consistent snapshot.

## Compatibility

The backup contains 29 `user_profiles` rows. Its 20 profile columns exactly
match the current profile table columns, and every stored password value has a
bcrypt-format prefix. The backup predates 40 tables in the current expected
schema, including passkeys, TOTP/recovery, communication preferences, hardware
inventory, scheduling, device-call sessions, and session locks. It must not be
used as a complete replacement for the current database.

The dump includes `announcements` and `announcement_reads`; both remain excluded
from any historical restoration proposal as requested.

## User-profile recovery decision

User rows were not added to a Git migration. They contain names, email addresses,
phone numbers, password hashes, MFA state, avatar paths, and account metadata.
Committing those records would replicate sensitive production identity data to
GitHub and GitLab. Blind insertion would also risk duplicate emails, stale role
grants, password rollback, MFA rollback, and conflicts with newer live accounts.

A safe profile reconciliation requires a current read-only live export or query
result. Compare by stable `id` and normalized email, classify each row, then
prepare separately encrypted, access-controlled INSERT-only SQL for confirmed
missing accounts. Password/MFA/session fields require explicit security review;
do not restore them automatically. Take and verify a fresh backup immediately
before any approved execution.

## Application errors

The current source implements the profile-name and passkey registration routes.
A production 404 indicates an outdated/mismatched backend or proxy target. The
deployment verifier now refuses packages missing these routes. The production
environment template now includes the exact WebAuthn origin/RP configuration,
and passkey endpoints return explicit migration/configuration errors instead of
an ambiguous generic failure.
