# Shared affected modules and request table correction

23 November 2026 (Africa/Nairobi)

## Result and use

SuperAdmin and Developer Lead (`Teamlead`) can open **Developers → New Request → Modules Affected → Manage shared modules**, or the same panel inside **Edit Change Request**. They can add or rename module names, change display order, retire options and reactivate them. Lower order numbers appear first. Changes are saved for the organization’s CRMS workspace and reused on both forms; they are no longer browser-local lists.

Other authenticated Developer-workspace roles can read/select shared options under their existing request permissions. Only SuperAdmin and Teamlead may manage the catalogue, enforced on the server. Developer Leads may update request priority and affected modules from the Edit dialog; unrelated description/scope fields are read-only for them. Other role permissions are unchanged.

Retirement hides an option from new selections without deleting its history. Renaming changes future selections and does not rewrite names recorded on older requests. Historical/retired values remain visible as **Existing selection** while editing the request, and may be kept or removed. New requests cannot submit arbitrary unapproved names; server validation canonicalizes active catalogue names and rejects unknown options.

## Root causes and implementation

The request Description cell had a maximum width but inherited non-wrapping text, allowing long descriptions to paint over Priority/Status. The targeted fix uses normal wrapping, word breaking for long references, a bounded paragraph width, and top-aligned row cells. Full descriptions remain available. Desktop tables retain contained horizontal scrolling, and narrow panels keep the existing labeled-card layout.

New Request and Request Detail each maintained separate hard-coded module arrays plus local add/delete state. They now share `AffectedModulesPicker`, backed by:

- `GET /api/crms/affected-modules`: authenticated catalogue and effective management permission.
- `POST /api/crms/affected-modules`: SuperAdmin/Teamlead create.
- `PATCH /api/crms/affected-modules/:id`: SuperAdmin/Teamlead rename, ordering and active-state update with the current version number.

Management validates field types, normalized names (1–100 characters), order and version, and rejects duplicate names. Row locking/version checks prevent silent lost updates. Catalogue changes and actor/previous/next values are committed together in the audit table; failures roll back. Request selections are validated against active canonical options plus that request’s historical values. Queries are parameterized, and catalogue operations expose no SQL errors or credentials.

`20261123_affected_module_catalog.sql` adds `crms_affected_modules` and `crms_affected_module_events`, seeds the existing sixteen default names with stable IDs and registers migration history. Stable IDs prevent a migration retry from recreating the original name of a renamed default. Existing request data is not altered or deleted. The established deployment runner applies it after verified backup and checks the new table columns before API restart.

## Validation

- Actual browser text-range checks: long paragraphs and unbroken references remain inside the Description cell at 320, 390, 600, 768, 820, 1024, 1107, 1366 and 1920px. No page overflow. The 1107px reproduction width was visually reviewed.
- Expanded catalogue management fits 320, 390, 768, 1107 and 1920px. Browser interactions verify shared create/rename/retire/reactivate, persistence across pages, preservation of historical names, Developer Lead’s scoped edit payload and absence of management controls for a Developer. Test-only fixtures intercept all API writes; no real requests are created during browser QA.
- Additional responsive stress matrix: 33 viewport/orientation checks on Request List, New Request and Request Detail passed.
- Disposable local database test: migration retry, normalization, duplicate rejection, unauthorized roles, stale version conflict, retirement, canonical selection, historical-name preservation and audit rollback/commit pass. Renaming a seeded default survives reapplying the migration. Only the validated disposable schema is removed.
- Three catalogue unit tests cover management roles, invalid names, canonical and historical selections.
- Both application builds and TypeScript passed. Full regression suite: 247 tests passed, with two existing integration skips. Focused lint on the changed request UI passed with no errors or warnings. Existing completion/sign-off browser checks also passed after the picker integration.

A verified local pre-migration backup contains 98 tables: `backup_riana_cims_2026-11-23_05-58-38-263_d6cede43.sql`. The local migration completed and the two managed CIMS servers restarted. Backup contents, uploads, authentication, notification providers and client sign-off evidence were preserved.

## Prior verification and production boundary

The previously interrupted production browser check was retried successfully for fingerprint visibility, password toggle, recovery dialog and keyboard focus. The production maskable icon returned opaque teal `[8,111,118,255]`. However, the current production API reported an older SHA than the prior verified release; do not equate these asset checks with the latest API deployment. Publishing must be followed by exact SHA/served-asset verification. No live client message or sign-off is used for release tests.

Rollback: restore the prior application release and retain the new catalogue/audit tables, so configured names and audit records remain recoverable. Do not drop them or rewrite historical request module strings as routine rollback. Deployment and API/frontend versions should be kept together; an unavailable catalogue presents a retryable error while existing selections remain visible.
