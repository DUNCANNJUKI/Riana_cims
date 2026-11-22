# Responsive system tables

Updated 2026-11-21.

## Problem and behavior

Shared CIMS and CRMS tables previously forced a minimum width of 640px, including compact tables. Clients and activity logs exposed desktop columns on narrow screens. Audit tables also nested two horizontal scroll containers, and client action/count rows did not wrap.

- Compact shared tables now fit the available panel width naturally. Dense tables retain their grid and scroll within their panel rather than widening the page.
- A shared `TableScrollArea` observes the table and viewport sizes. Only overflowing tables receive a keyboard focus stop, named region, associated scrolling instructions and visible focus outline. Native touch and arrow-key scrolling remain available. Observers disconnect on unmount.
- Clients, My Activity and Audit Logs opt into labeled record layouts when their table panel is at most 40rem wide. This responds to the panel width, including narrow desktop panes, rather than only the device viewport. Every field remains present and long values wrap.
- The desktop grid remains available above that width. No duplicated mobile dataset, second fetch, new dependency or alternate business workflow was introduced.
- Mobile labels are hidden from assistive technology to avoid duplicating the semantic headers. Column headers remain in the accessibility tree; explicit table/row/cell roles preserve semantics when CSS changes layout.
- Client controls and record counts wrap, and the search input has an accessible name. Existing contact masking, reveal handlers and role checks remain unchanged. The audit empty-state colspan accounts for the optional actor and IP columns independently.

## Files

- `src/components/ui/table-scroll-area.tsx`: shared containment, overflow observation and keyboard guidance; also reused by CRMS.
- `src/components/ui/table.css`: semantic theme colors, panel container query, labeled mobile rows and scrolling styles.
- `src/components/ui/table.tsx`: optional `mobileLayout="cards"` and cell `mobileLabel`, native sizing and table semantics. Default layout remains a scrolling grid.
- `CRMS/src/components/ui/table.tsx`: natural sizing and the shared scroll area; existing CRMS table styles remain in place.
- `src/components/ui/card.tsx`: permits cards to shrink within flex/grid layouts.
- `src/components/clients/ClientsModule.tsx`: mobile labels, wrapping actions/counts and accessible search.
- `src/components/audit/AuditLogsModule.tsx`: mobile labels, removal of nested scrolling and accessible full desktop values via titles.

## Verification

- `npm.cmd run build:all`: CIMS production/PWA and CRMS builds passed.
- `npm.cmd run typecheck`: passed for CIMS and CRMS.
- Focused ESLint: no errors. Three existing effect-dependency warnings remain in Clients/Audit modules; their loading handlers and effects were not changed. Shared table components passed focused lint without warnings.
- `git diff --check`: passed.
- Installed Playwright Chromium used because the Browser plugin is unavailable. The temporary harness loaded the actual React components and styles from `http://127.0.0.1:8090`, with synthetic API fixtures intercepted only in the isolated browser. It did not modify application routes or live data. The browser's local-network checks were disabled only for the synthetic harness so Vite's development websocket could connect.
- Clients, My Activity, Audit Logs, a dense CIMS grid and a dense CRMS grid each passed at widths 320, 375, 390, 430, 768, 1366 and 1920px: 35 viewport combinations.
- Compact two-column CIMS/CRMS tables passed the same seven widths without unnecessary horizontal scrolling: 14 more viewport combinations.
- Checked page/cell overflow, mobile field wrapping, table accessibility roles, focusability and arrow-key scrolling. No uncaught application exceptions occurred.
- Search filtering, no matching clients, View dialog open/close, Sales versus SuperAdmin vendor/action visibility, My Activity refresh and audit empty state passed.
- Live viewport resize switched activity records between mobile and desktop without reloading. Stable dark-mode colors were verified after transitions completed: dark record background `rgb(20, 24, 31)` and foreground `rgb(248, 250, 252)`.
- Light/mobile, dark/mobile and desktop screenshots were inspected directly. Screenshots and temporary harness scripts stayed outside committed source. Synthetic long identifiers and unbroken names were included to exercise wrapping.

## Limits and support

Backend authorization, API contracts, database schemas, filters, pagination and export handlers were not changed. Browser role checks validate presentation only, not new authorization behavior. The checks used fixtures rather than the user's active session. Physical mobile Safari and every individual consuming module were not exercised; the shared CIMS/CRMS implementations were tested directly and both applications built successfully.

On mobile, scroll vertically through labeled Clients/activity records. For wide grid tables, swipe within the table or focus its outlined scroll region and use Left/Right arrows. The hint appears only when columns overflow.

New card-layout consumers must explicitly opt in and supply a `mobileLabel` for every regular body cell; dense/complex headers should retain the default grid layout. Keep explicit minimum column widths only where the data requires them.

## Rollback

Revert only the table-related changes listed above and rebuild both frontends. Prior login styling is separate work and should be preserved. No database or backend rollback is required.
