# Record table responsiveness and alignment

Updated 2026-11-22.

Checked Installation Records, Reports / Uploaded E-Handover Forms, Uploaded Handover Documents and Recent Change Requests with populated synthetic data.

## Corrections

- Applied the existing labeled mobile-record layout to all four tables. Desktop grids remain available when the table panel exceeds 40rem; every existing data column and permitted action is preserved.
- Installation status controls shrink to their mobile value column. Installation counts wrap instead of competing for a single line.
- E-handover filenames wrap and their icons align to the start of the document text. Preview/download actions and record counters wrap within their panel.
- Recent Requests headers and View All wrap together. Description and Date are accessible at small widths instead of being hidden. Descriptions wrap, and the action menu has a ticket-specific accessible label.
- Extended the CRMS table primitive with the same optional labeled layout already supported in CIMS, retaining the CRMS-local React hooks and existing default scrolling-table behavior. Explicit native table roles preserve semantics under the mobile layout.

Files: `src/components/installations/InstallationsModule.tsx`, `src/components/reports/ReportsModule.tsx`, `src/components/handover/HandoverUploadModule.tsx`, `CRMS/src/components/dashboard/RecentRequestsTable.tsx`, `CRMS/src/components/ui/table.tsx`. Audit fixtures/catalog were extended with real-shaped synthetic uploads, long descriptions and a direct Recent Requests surface.

## Validation

- Playwright checked four populated surfaces at 320, 360, 375, 390, 414, 430, 600, 768, 820, 1024, 1280, 1366, 1440 and 1920px, plus 844x390 landscape and 320x480 short portrait: **64 checks passed**, with no page/main overflow or uncaught component errors.
- Screenshots inspected at mobile widths; JSON and PNG evidence is under `docs/evidence/responsiveness-20261121/records-alignment/`.
- CIMS/CRMS builds and TypeScript checks passed. CRMS's 14 existing tests passed. Focused lint had no errors; existing hook/type warnings were retained.
- Browser checks used actual components with intercepted synthetic API responses, without changing live records, permissions, upload/download handlers or backend services. Physical devices and live document download/provider access were not exercised in this layout-only change.

Reproduce: `node scripts/qa/responsiveness-browser-qa.cjs --phase=records-alignment --surfaces=installations,reports,handover,recent-requests` against the existing localhost Vite server.

Rollback only this scoped table markup/utility change and the optional CRMS mobile-label support; preserve earlier authorized work. No database or backend rollback is needed.
