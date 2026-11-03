# Technician-based installation budgeting

Date: 2026-11-02  
Local implementation status: implemented and migration applied locally  
Staging/production status: not applied and not authorized

## Business model

New installation budgets are calculated exclusively from assigned-technician expenses:

`technician total = accommodation + transport + meals/per diem + other expenses`

`installation total = sum of all assigned-technician totals`

The server calculates both totals with integer cents and persists them as `DECIMAL(15,2)`. Client-supplied totals are ignored. Equipment, labor, shared, and project-level costs are not accepted by the new workflow.

## Association and authorization

- The selected installation is authoritative for client and branch association.
- Assigned technicians are read only from the installation and its `client_assignments` records and are deduplicated.
- Inactive and unrelated technicians are excluded.
- Non-SuperAdmin access is restricted to the authenticated user's subsidiary.
- `finances.view` protects reads and assigned-technician retrieval; `finances.manage` protects creation and revision.
- A current technician budget is unique per installation at application level under a transactional row lock.

## Integrity and history

- Legacy finance rows remain labelled `legacy`; historical labor/equipment/shared values are not reclassified.
- Technician budgets are immutable revisions. Editing creates a new row, archives the previous current revision, snapshots technician names, and writes an audit event.
- Technician budgets cannot be deleted through the API. Excel (`.xlsx`) and PDF exports contain per-technician category detail, subtotals, and the installation total. Legacy exports retain their original labor, equipment, transport, and miscellaneous labels.
- Migration: `20261102_technician_installation_budgets.sql`.
- Rollback is non-destructive by design; new history is retained during application rollback.

## Local validation

- Technician calculation tests: 4 passed, covering multiple technicians, zero expenses, unrelated/duplicate technicians, and malformed/negative/over-precision amounts.
- Full backend suite: 105 tests, 103 passed, 2 isolated MySQL suites skipped, 0 failed.
- TypeScript: passed.
- Targeted Finance lint: passed after hook dependency correction.
- CIMS production build and PWA generation: passed.
- Excel/PDF export production bundling: passed after using the package's browser-specific entry point.
- Local migration: applied successfully after aligning new table collation with referenced tables; repeat-safe migration history recorded.

## Remaining acceptance

- The requested interactive browser controller could not start because the Windows sandbox failed `CryptUnprotectData` on three attempts. This is an environment blocker, not an application failure.
- Authenticated live UI acceptance still requires the browser runtime or an explicitly supplied non-production Finance test account.
- Staging must verify concurrency, revision history, subsidiary denial, exports, backup/restore, and rollback before production approval.
