# RIANA CIMS UI/UX Regression Report

Date: 30 October 2026

## Baseline

- Existing production build passed before the second modernization pass.
- Existing login screenshots were captured at 1440×900 and 390×844.
- Baseline audit identified one ESLint error in chat rendering plus a substantial pre-existing warning backlog.
- The in-app Browser initialization failed with Windows `CryptUnprotectData` error `2148073483`; this is an environment limitation rather than an application failure.

## Final automated results

| Check | Result | Evidence |
|---|---|---|
| CIMS production build | Pass | `npm run build:all` |
| CRMS production build | Pass | `npm run build:all` |
| CRMS unit tests | Pass | 2 files, 7 tests |
| CRMS PDF generator | Pass | 6 tests within CRMS suite |
| Request error safety | Pass | 2 tests |
| Calendar range behavior | Pass | 2 tests |
| Fixture regression suite | Pass with limitation | Finance 1366/390 and RTC state fixture; no real call transport |
| Authenticated CIMS render | Pass with mocked data | 1440×1024 and 390×844; zero console errors; no page overflow |
| CRMS navigation/render | Pass with mocked data | Developers interaction reached `/developers`; zero console errors |
| Patch whitespace | Pass | `git diff --check` |
| Prohibited provider-name scan | Pass | No matches in tracked working scope |

## Functional regression findings

- API URLs, request/response shapes, query hooks, status calculations, role checks, redirects, and dashboard polling behavior were preserved.
- CIMS quick actions use existing module keys and the existing `can()` capability checks.
- CRMS role cards retain their original metrics, calculations, action labels, destinations, and visibility logic.
- No database, migration, server route, authentication-token, report generator, PDF template, upload, or export source was modified.

## Visual regression findings

- Login desktop and mobile images retain the original logo, card, teal/cyan gradients, network nodes, fields, actions, and copyright treatment.
- Dashboard concept fidelity was checked for header identity order, compact page hierarchy, KPI density, role-card geometry, tab treatment, table priority, palette, and spacing.
- The generated concepts contain illustrative data only; none of those values were introduced into application code.

## Accessibility findings

- Added visible focus outlines, labelled identity regions, semantic dashboard headings, minimum mobile target height, reduced-motion handling, loading skeletons, and contained scrolling.
- Existing Radix dialog focus management and backend authorization remain unchanged.
- A live screen-reader and complete keyboard pass could not be executed without an authenticated test account.

## Remaining issues and risk

- High: authenticated end-to-end workflows listed in the brief were not executed; production readiness must not be inferred from build and unit-test success.
- Medium: 420 pre-existing ESLint warnings remain outside this presentation-focused patch. Twelve occur in touched files, all on unchanged lines; the modernization-introduced warning count is zero.
- Medium: the complete dark-theme, requested-viewport, and native 200% zoom matrix requires live authenticated visual verification.
- Low: the greeting refreshes once per minute, so a boundary change can display within at most 60 seconds.

## Screenshots and concepts

- CIMS dashboard concept: `C:\Users\Duncan\.codex\generated_images\01a17c33-c0cc-7371-883a-d3448a0c6679\exec-2166e8c1-9692-4001-ac40-f181f06a4f20.png`
- CRMS concept: `C:\Users\Duncan\.codex\generated_images\01a17c33-c0cc-7371-883a-d3448a0c6679\exec-df722978-1509-47e7-9a77-e54a3d87385e.png`
- Authenticated dashboard desktop: `C:\Windows\Temp\riana-dashboard-desktop.png`
- Authenticated dashboard mobile: `C:\Windows\Temp\riana-dashboard-mobile.png`
- Authenticated CRMS desktop: `C:\Windows\Temp\riana-crms-desktop.png`
- Final login desktop: `C:\Windows\Temp\riana-modern-login-desktop.png`
- Final login mobile: `C:\Windows\Temp\riana-modern-login-mobile.png`

## Release assessment

The patch is buildable, its available automated tests pass, and its primary CIMS/CRMS layouts pass read-only mocked authenticated rendering. It is not declared production-ready because real multi-role workflow regression testing remains incomplete. No deployment was performed.

## Final verification run (30 October 2026)

- `npm run build:all`: passed for CIMS and CRMS.
- `npm --prefix CRMS test -- --run`: passed, 2 files and 7 tests.
- Request-error suite: passed, 2/2.
- Calendar-range suite: passed, 2/2.
- Fixture regression: passed; real call transport explicitly remained untested.
- ESLint: 0 errors and 420 warnings across 80 files with messages.
- Changed-file lint/diff correlation: 0 introduced errors and 0 introduced warnings; 12 pre-existing warnings remain on unchanged lines in touched files.

## Outstanding release gates

- Obtain non-production accounts for Super Admin, Admin, Management, Finance, Team Lead, Developer, Sales, User, and Inventory Officer.
- Validate CIMS/CRMS visibility, server permissions, and subsidiary isolation with disposable test records.
- Complete light/dark rendering at all requested widths, native 200% zoom, keyboard traversal, and screen-reader checks.
- Exercise installation management, clients, assignments, inventory, feedback, change requests, approvals, reports, finances, messaging, and administration end to end.

## Rollback considerations

Rollback is frontend-only: revert the modernization files listed in `UI_UX_MODERNIZATION_REPORT.md`, remove the new dashboard component, rebuild both applications, and rerun the same tests. No schema or business-data rollback is needed.

## Design-system and loader verification (31 October 2026)

- CIMS and CRMS production build: passed after the shared primitive and loader changes.
- CRMS Vitest: passed, 2 files and 7 tests.
- Request-error safety: passed, 2/2.
- Calendar ranges: passed, 2/2.
- Targeted ESLint on all new/modified primitives and loader: 0 errors; two pre-existing Fast Refresh export warnings remain in badge primitive files.
- Loader Playwright matrix: 320, 375, 390, 430, 768, 1024, 1440, and 1920px passed with zero console errors and no horizontal overflow.
- Loader border measurement: 0px; no replacement frame or heavy shadow.
- Loader reduced motion: node, letter, and indeterminate-progress animation names all compute to `none`.
- Authenticated Hardware & Inventory mocked render: 1440px light, 390px light, and 1440px dark passed with zero console errors and no page-wide overflow after the typed fixture was completed.
- Desktop inventory action-dialog render passed; mobile navigation accessibility warning was resolved with a hidden sheet title.

### Fidelity ledger

| Comparison point | Concept/reference | Rendered result | Resolution |
|---|---|---|---|
| Loader geometry | Supplied borderless GIF | Same centered network/title/progress/message hierarchy | Matched |
| Official logo | Full-color RIANA mark | Authentic transparent RIANA logo asset, mark region only | Matched without redraw/recolor |
| Loader motion | Sequential nodes and letters | 2.4s node sequence and 3s letter sequence | Matched |
| Application palette | Cool canvas, white surfaces, RIANA teal | Semantic canvas/surfaces/primary tokens | Matched |
| Overlays | Restrained backdrop, clear form hierarchy | Shared dialog/sheet primitives | Matched |
| Mobile controls | Touch-safe, contained tabs/filters | 44px mobile targets and contained tab scrolling | Matched |
| Inventory copy/data | Illustrative concept records/actions | Existing production actions, metrics, tabs, and empty fixture | Intentional deviation to preserve workflows |

The built-in Browser runtime remained unavailable because of the documented Windows `CryptUnprotectData` failure; Playwright Chromium was used as the fallback. Live backend authorization, subsidiary isolation, and mutation workflows remain blocked without non-production accounts and disposable test data.

## Login and Account & Security regression (1 November 2026)

| Check | Result |
|---|---|
| Compact Sign In + fingerprint row | Passed at 320, 375, 390, 768, 1024, and 1440px |
| Matched button height and same-row alignment | Passed at all tested widths |
| Horizontal overflow | None at all tested widths |
| Password visibility control | Passed; input changed to visible text state |
| Passkey tooltip and accessible name | Passed |
| Keyboard focus on fingerprint control | Passed using Tab traversal |
| Console and page errors | None |
| TypeScript and focused ESLint | Passed with zero errors/warnings in the two refined components |
| Communication tests | 11 passed |
| Authentication/timezone tests | 6 passed |
| CIMS/PWA build | Passed; 6,189 modules and 107 precache entries |
| CRMS build | Passed; 3,256 modules |

Authenticated Account & Security interactions were not browser-executed because no non-production account credentials were provided. API integration is type-, lint-, and build-verified; physical passkey behavior remains pending.
