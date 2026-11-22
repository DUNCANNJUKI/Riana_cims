# Developer module table responsiveness

Updated: 22 November 2026

## Findings and changes

The Client Change Request Management request and invitation tables, Developer request list, report summary/documents tables and user table still relied on desktop rows. The request list also hid descriptions, assignees and dates at smaller breakpoints. This made information hard to find even when horizontal scrolling prevented page overflow.

All six tables now opt into the existing shared, container-responsive table layout. Panels at most 40rem wide show labeled records; wider panels retain tables with contained horizontal scrolling when necessary. Each field remains available, including descriptions, assignees and dates. Client request actions wrap, title text wraps on mobile, and request filters fill narrow rows. Ticket sorting is also available outside the visually clipped mobile header. Developer user actions have an accessible name, and the empty user row spans all six columns.

The existing Recent Requests table already used this layout and was included in regression checks. Pending Work, Approvals, Assignments and Audit use cards or a timeline rather than tables; their populated layouts were checked without changing their workflows.

Changed application files:

- `CRMS/src/pages/ClientRequests.tsx`
- `CRMS/src/pages/RequestList.tsx`
- `CRMS/src/pages/Reports.tsx`
- `CRMS/src/pages/Users.tsx`

## Validation

318 local Chromium viewport/state checks passed with no detected page overflow, main-content overflow, mobile cell-content overflow, escaped controls, dialog fit failures or page exceptions:

- 216 checks across Overview, Client Requests, Pending Work, Requests, New Request, Request Detail, Approvals, Assignments, Reports, Audit, Users and Recent Requests. Widths: 320, 360, 375, 390, 414, 430, 600, 768, 820, 1024, 1280, 1366, 1440 and 1920px; also 844x390 and 320x480. All Client Requests and Reports tabs checked at 320, 768 and 1280px.
- 41 stress checks with 100 synthetic records and long client references, including invitations.
- 41 empty-state checks.
- 20 additional checks including mobile search/clear, ticket sorting and request/user action menus.

Screenshots of mobile invitation and report records were visually reviewed. One initial stress screenshot hit the screenshot/font timeout; rerunning with a 30-second screenshot allowance passed. No application change was needed for that runner timeout.

Additional validation passed:

- `npm.cmd run build:all` (CIMS and standalone CRMS production builds).
- `npm.cmd run typecheck` (CIMS, Node configuration and CRMS).
- `npm.cmd --prefix CRMS test` (14 tests).
- Focused ESLint on the four changed pages (zero errors and warnings).

Evidence directories under `docs/evidence/responsiveness-20261121/`: `developer-tables`, `developer-tables-stress`, `developer-tables-empty`, `developer-table-interactions`. The existing dated evidence root is retained for this continuing audit. JSON results include viewport findings, errors and interaction checks. The fixture runner now detects mobile cell overflow, supports tab-width matrices and exits unsuccessfully on detected defects for any phase.

## Security, performance and scope

No API contracts, SQL, database structures, role checks, tenant filters, request lifecycle, notifications or authentication behavior changed. Existing UI data and handlers are reused, with no additional runtime requests or dependencies. Browser checks use actual components in a local fixture harness with intercepted APIs and synthetic records; they do not validate production data or provider delivery. Physical-device and Safari testing remain outside this local Chromium verification.

## Rollback and support

Refresh the local application at `http://localhost:8090` to load the updated frontend. No migration or server configuration change is required. For a layout rollback, remove only the `mobileLayout`/`mobileLabel` additions and associated filter/action styling changes from these four pages. Preserve the other existing uncommitted changes, especially implementation confirmation and client tracking. Production publishing was not part of this change.
