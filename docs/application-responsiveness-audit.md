# Application responsiveness audit and corrections

Audit started 2026-11-21; verification resumed 2026-11-22 (Africa/Nairobi).

## Scope and coverage

Responsiveness changes preserve the approved login design, colors, typography, icons, animations, authentication, APIs, database, permissions and workflows. Earlier login/table/Optimus changes in the working tree are separate authorized work.

The source inventory scanned 315 non-test TypeScript/TSX/CSS files in CIMS and CRMS, including route declarations and responsive utilities. Runtime coverage is enumerated precisely in `scripts/qa/responsiveness-surfaces.json`: 51 page/module/dialog surfaces plus 8 shared-overlay probes, not a claim that every possible data-dependent state was exercised.

Browser-tested surfaces include operational dashboard; clients and client details/editing; assignments; installations and details; inventory and its exposed tabs; progress; users; finance; company settings (company, branding, subsidiaries, feedback, email, maintenance and data tabs); import; reports; analytics; audit/activity; handover; calendar and scheduling; announcements; help; technician dashboard/profile; profile/security/preferences; password change; approved login; password reset; installation/PWA page; maintenance; public asset history; public feedback; client request submission/review/tracking; not-found states; Developers overview, client requests, pending, requests, creation, detail, approvals, assignments, reports, audit and legacy users/not-found views; communication shell; and CIMS/CRMS confirmation, select, popover and dropdown primitives.

The recording mentioned in the brief was not attached. The user's screenshots, current application components and explicit brief were used.

## Findings and minimal corrections

| Surface | Reproduction | Root cause | Correction |
| --- | --- | --- | --- |
| Subsidiary configuration | 320px, Subsidiaries tab | Title and Add button share a non-wrapping header | Wrap the existing header with a gap |
| Developer New Request | 320px | Footer buttons require more than the available width; form controls/cards retain intrinsic minimums | Stack footer buttons below `sm`; permit inputs/cards to shrink |
| Inventory Registry | 1024px with desktop sidebar | Four filter columns activate before the available content area fits Advanced Filters | Activate four columns at `xl`, preserving the existing two-column intermediate layout |
| CIMS/CRMS confirmation dialogs | Long content, 320px and 844x390 | No maximum viewport height or scroll area | Add dynamic viewport height/width limits and vertical scrolling |
| CIMS/CRMS popovers | Long content and short viewport | Content can be taller than the available collision area | Bound height to Radix available height; contain vertical scrolling and width |
| CIMS/CRMS dropdown/submenu lists | Long menus | Lists can exceed available collision area | Bound available height/viewport width and scroll within the existing menu |
| CRMS shared table regression | Existing CRMS Vitest suite | Imported root-workspace hook component used a different React instance | Keep the small hook wrapper local to CRMS and share its stylesheet only; no dependency/configuration change |

No general redesign, global text-size change, column removal, call-processing change or server configuration change was introduced. Shared inputs gain `min-w-0` only. Existing desktop styles are preserved where space is sufficient.

## Browser verification

Installed Playwright Chromium was used because the Browser plugin is unavailable. The actual React components and authenticated shell render against synthetic, intercepted API responses on localhost; no live business records are created or changed. Synthetic credentials are not valid server credentials. Provider/signaling streams are intercepted. Test-only local-network flags permit the synthetic page to load the local Vite modules.

- Widths: 320, 360, 375, 390, 414, 430, 600, 768, 820, 1024, 1280, 1366, 1440 and 1920px.
- The final primary matrix contains **978 viewport/state checks across 59 surfaces**, including exposed tabs, 844x390 landscape and 320x480 short portrait. Individual final JSON files are under `evidence/responsiveness-20261121/after/`. The last `results.json` is a run subset; the per-surface files are the coverage source of truth.
- No final primary check reports document overflow, main-panel overflow, escaping controls, dialogs outside the viewport or an uncaught component exception.
- Touch navigation opens, scrolls and closes at 320x480. Notifications and profile menus remain accessible; desktop sidebar collapse/expand and light/dark controls passed.
- Reflow equivalents of 100%, 125%, 150% and 200% browser zoom were checked by reducing effective CSS viewport dimensions. These are **not native browser toolbar zoom tests**.
- Additional large-list/long-name and empty-state checks are saved in the `stress/` and `empty/` evidence directories; synthetic lists contain up to 200 users or 100 records depending on the fixture.
- A transient chart resize observation was retested after layout/ResizeObserver settling and did not reproduce as persistent overflow. Baseline fixture-shape errors were corrected in test data rather than changing production business logic.

## Before/after screenshots

All evidence uses synthetic data. Useful comparisons:

- [Subsidiary header before](evidence/responsiveness-20261121/before/company-tab-2-320.png) / [after](evidence/responsiveness-20261121/comparison/company-tab-2-320.png) .
- [New Request before](evidence/responsiveness-20261121/before/developer-new-request-320.png) / [after](evidence/responsiveness-20261121/after/developer-new-request-320.png).
- [Inventory filters before](evidence/responsiveness-20261121/inventory-check/inventory-1024.png) / [after](evidence/responsiveness-20261121/after/inventory-1024.png).
- [Confirmation before](evidence/responsiveness-20261121/before/confirmation-dialog-320.png) / [after](evidence/responsiveness-20261121/after/confirmation-dialog-320.png).
- [Popover before](evidence/responsiveness-20261121/before/popover-320.png) / [after](evidence/responsiveness-20261121/after/popover-320.png).

## Automated validation and reproducibility

- CIMS production/PWA and CRMS builds passed (`npm.cmd run build:all`).
- CIMS and CRMS TypeScript checks passed.
- Frontend source and audit-harness lint: zero errors; 104 warnings in the inspected source set. Existing warning cleanup is outside responsiveness scope.
- CRMS: 14 tests passed after correcting the shared-wrapper React boundary.
- The aggregate run initially failed its loopback HTTP communication-runtime test inside the network sandbox. The unchanged test passed all 3 cases when rerun with local network access. It also exposed the CRMS hook issue, which was corrected rather than waived.
- The final full regression run passed 236 tests with 2 existing hardware/MySQL skips. The separate implementation SQL integration test also passed; see client-implementation-confirmation.md.

Reproduce with `node scripts/qa/responsiveness-browser-qa.cjs --phase=after` and `node scripts/qa/responsiveness-interactions.cjs` while the existing local Vite frontend is running. API routes are intercepted by the browser only. `--state=empty` and `--state=stress` select alternate fixtures. Use `--surfaces=` and `--widths=` for bounded reproductions.

## Explicit limits and unresolved verification

Physical-device Safari/Android keyboards, native browser toolbar zoom, real multi-party calls/media capture/recording/background processing, external Optimus, actual provider notifications, every asset-specific inventory dialog, PDF rendering/printing and every permission/data combination were not live-tested. Communication layout was inspected and its existing regression tests run; no live media acceptance claim is made. Legacy/unrouted code was source-scanned, not represented as an accessible production route. These require device/provider/data-specific follow-up; they are not hidden by a blanket application certification.

## Rollback

Reverse the responsiveness-only class adjustments in the shared overlays/inputs, CRMS card and New Request footer, subsidiary header and inventory filter grids. Retain the CRMS-local React hook boundary fix and unrelated prior approved work. Rebuild both frontends. There are no environment, routing, database or backend changes in this responsiveness scope.
