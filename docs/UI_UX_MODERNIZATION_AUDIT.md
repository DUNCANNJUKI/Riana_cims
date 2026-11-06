# RIANA CIMS UI/UX Modernization Audit

Date: 2026-10-30

## Scope and invariants

This audit covers the CIMS React/Vite frontend and its embedded CRMS React workspace. The modernization is presentation-only. Existing API contracts, database schemas, authentication, authorization, role/subsidiary boundaries, operational workflows, exports, generated-document templates, and production data remain unchanged.

## Application inventory

- Framework: React 18, TypeScript, Vite, Tailwind CSS 4, Radix UI, shadcn-style source components, React Router, TanStack Query.
- Shared shell: `Index`, `Header`, `Sidebar`, maintenance/offline banners, profile menu, notifications, chat, chatbot, and system footer.
- Primary modules: dashboard, clients, installations, hardware and inventory, assignments, scheduling/calendar, installation progress, users, finance, announcements, company settings, import, reports, analytics, handover upload, audit/activity, technician workspace/profile, help, and developer/CRMS workspace.
- Public/authentication surfaces: login, password reset, feedback form, public asset history, install-app, maintenance, and not-found pages.
- Shared UI families: cards, tables, forms, buttons, badges, alerts, dialogs, sheets, drawers, dropdowns, tabs, pagination, skeletons, toasts, charts, calendars, and responsive scroll areas.
- Theme: semantic HSL tokens with persisted light/dark preference. Authentication has isolated `riana-login-*` styling and network-node artwork.

## Findings

1. Feature files frequently override the shared system with raw green, blue, orange, red, gray, and gradient utilities. This produces inconsistent statuses and incomplete dark-theme behavior.
2. Card density, title size, radius, padding, and shadow differ across modules. Several pages combine nested cards with large whitespace.
3. The dashboard used a large gradient welcome panel, three conditionally sized KPI cards, and visually clickable quick-action `div` elements without real interaction semantics.
4. Navigation grouping was already permission-aware, but active treatment, motion, spacing, and category typography were visually heavy.
5. Shared tables had safe horizontal containment, but headers and enclosing surfaces lacked a consistent enterprise hierarchy.
6. Shared inputs used strong ring offsets and inconsistent feature-level overrides. Disabled and hover states needed stronger differentiation.
7. Several feature modules contain fixed width/height utilities and dense dialogs. Shared responsive primitives reduce risk, but individual workflow QA remains necessary.
8. Icon-only shell actions generally have labels or titles; feature-level icon buttons still require ongoing accessible-name review.
9. Reduced-motion handling existed for selected animations rather than as a system-wide guarantee.
10. Authentication is visually coherent and responsive. Global modernization must remain scoped so its logo, gradients, network artwork, and card identity do not drift.

## High-risk workflows

- Authentication, password reset, inactivity/session handling, and role-based navigation.
- Installation create/edit/assignment/completion, feedback persistence, equipment serialization, and e-handover exports.
- Hardware stock movements, stocktakes, QR flows, and inventory reporting.
- Finance records and approval controls.
- File uploads/downloads, report previews, and generated documents.
- Messaging/calls, notifications, maintenance mode, and developer/CRMS permissions.

## Implementation sequence

1. Central tokens, typography, focus, motion, and authenticated canvas.
2. Shared cards, buttons, inputs, tables, overlays, badges, loading and empty states.
3. Header/sidebar/content shell and mobile navigation.
4. Dashboard using only existing API data and permission checks.
5. Module-by-module replacement of raw visual utilities with shared semantic variants, starting with installations, inventory, clients, and users.
6. Authentication accessibility refinements inside its isolated style boundary only.
7. Desktop/mobile/dark-theme/200%-zoom visual regression, keyboard/accessibility checks, and workflow regression tests.

## Changes completed in this pass

- Refined semantic app canvas, neutral contrast, borders, radii, focus treatment, selection, and global reduced-motion behavior.
- Standardized shared card, button, input, and table primitives; these propagate consistently to all consuming modules.
- Calmed and tightened grouped navigation while preserving the existing item filtering, routes, and permissions.
- Replaced the oversized dashboard banner with a compact page header and access context.
- Standardized four responsive KPI cards, real activity display, accessible loading skeletons, and permission-gated functional quick actions.
- Preserved authentication-specific CSS and all server, data, export, and generated-document code.

## Remaining controlled work

The shared foundation materially modernizes all consumers, but feature modules with raw color utilities or bespoke layouts should be migrated incrementally with authenticated workflow fixtures. Treat each module migration as a separate regression unit; do not bulk-rewrite business screens without representative role and data coverage.

## Rollback

The change is frontend-only. Revert the shared primitive/token changes, restore the previous dashboard import, and remove `ModernDashboard.tsx`. No database or server rollback is required.
