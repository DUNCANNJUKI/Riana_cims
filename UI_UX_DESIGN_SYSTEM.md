# RIANA CIMS UI/UX Design System

Date: 30 October 2026

## Purpose and scope

This design system unifies the CIMS and embedded CRMS presentation layer. It does not alter API contracts, database structures, authentication, permissions, subsidiary boundaries, status values, exports, or business workflows.

## Design principles

- Operational clarity before decoration.
- True-white content surfaces on a cool light-gray canvas.
- RIANA teal and cyan are the primary identity accents.
- One obvious primary action per page where practical.
- Readable information density; text is never reduced simply to fit more columns.
- Tables remain tables on desktop and use contained scrolling or deliberate record summaries on narrow screens.
- Non-interactive surfaces do not receive misleading hover elevation.

## Core tokens

| Token | Value or rule |
|---|---|
| Primary | Existing semantic `--primary`; RIANA reference `#098C98` |
| Dark teal | Existing `--primary-dark`; RIANA reference `#103E49` |
| Accent cyan | Existing `--primary-light`; RIANA reference `#17B9C6` |
| Canvas | Semantic `--background` with restrained `--muted` gradient |
| Surface | Semantic `--card`, true white in light mode |
| Text | Semantic `--foreground`; RIANA reference `#243746` |
| Border | Semantic `--border` |
| Radius | 8px small, 12px standard, 14px large |
| Control height | 40px desktop, minimum 44px touch contexts |
| Fast motion | 150ms |
| Layout motion | 220ms |
| Content width | Fluid up to 1920px |

Dark mode uses the same semantic roles with purpose-designed contrast. It is not a mechanical color inversion.

## Typography

- Font stack: Plus Jakarta Sans, Inter, system sans-serif.
- Page heading: 24–28px, 700 weight, compact line height.
- Section heading: 18–20px, 600–700 weight.
- Card title: 14–16px, 600 weight.
- Body and controls: 14–16px.
- Table text: 13–14px minimum.
- Supporting text: 12–14px with semantic muted contrast.
- KPI values: 24–32px.

## Spacing and layout

Use the 4, 8, 12, 16, 20, 24, and 32px scale. Pages use a compact header followed by functional content. Data-heavy modules may consume the available width. Avoid nested bordered cards when a section, table region, rail, or divider is sufficient.

Shared layout utilities:

- `cims-page-header`: title/context and primary action grouping.
- `cims-page-title`: responsive page-heading scale.
- `cims-section-title`: consistent section hierarchy.
- `cims-filter-bar`: search and related filters.
- `cims-data-region`: contained table or dense record region.
- `cims-long-list`: rendering containment for long independent rows.

## Component standards

### Buttons and inputs

Buttons use explicit primary, secondary, outline, ghost, destructive, and icon treatments. Inputs, selects, and textareas share 40px control geometry, 12px radii, visible focus rings, restrained shadows, and distinct disabled states. Submission behavior and validation remain owned by feature modules.

### Cards

Standard cards use a subtle border, 12px radius, restrained elevation, and consistent header/content/footer spacing. Interactive cards require actual keyboard-accessible interaction. KPI cards prioritize label, value, and existing context without invented trends.

### Tables

Tables use readable headers, 44px rows where practical, subtle separators, predictable actions, hover state, and horizontal containment. Critical data and actions must remain available at narrow widths. Sticky headers are used only when they do not collide with application chrome.

### Tabs

Tabs remain in a contained, horizontally scrollable rail. Active state uses a white/dark semantic surface and RIANA primary text rather than heavy gradients.

### Dialogs and sheets

Overlays use a 55% neutral backdrop with minimal blur. Dialogs are viewport-safe and scroll internally. Desktop task panels may use a right sheet up to 448px; mobile task panels may use a bottom sheet up to 92dvh. Close controls are 40px and labelled. Action footers remain visible for long sheets.

### Badges and statuses

Badges use low-intensity semantic backgrounds, readable text, and borders. Status meaning must also be expressed in text, never color alone.

### Loading and empty states

Prefer localized skeletons and module-level loading indicators after authentication. Full-screen loaders remain reserved for genuine application/session initialization. Empty, filtered-empty, error, and permission-restricted states must be distinct.

## Shell behavior

- Header target height: 60–72px.
- Greeting appears above the authenticated display name and updates using the existing local time behavior.
- Sidebar grouping and permission filtering remain authoritative.
- Main content is fluid and does not cause page-wide horizontal scrolling.
- Footer and floating communication controls must not cover content or actions.

## Responsive rules

- 320–430px: touch-safe controls, contained tab/filter scrolling, single-column task content, bottom-sheet overlays when used by a feature.
- 768–1024px: two-column summary layouts and compact navigation.
- 1280–1920px: three/four-column summaries and full data tables where suitable.
- At 200% zoom, the interface must reflow without hidden critical controls or page-wide horizontal overflow.

## Accessibility

Target WCAG 2.2 AA where practical. Use semantic headings, labelled icon controls, visible focus, logical tab order, Radix focus management, reduced-motion support, 44px touch targets, and screen-reader-compatible status text.

## Motion

Feedback transitions use approximately 120–180ms; layout/overlay transitions use 180–250ms. Motion must not delay business actions. The global reduced-motion rule removes nonessential animation when requested by the operating system.

## Authentication boundary

Login and password-reset presentation remains isolated under the existing authentication selectors. Global system utilities must not replace the RIANA logo, decorative network nodes, gradients, colors, card identity, or authentication behavior.

## Visual specification

- Desktop operational concept: `C:\Users\Duncan\.codex\generated_images\01a17c33-c0cc-7371-883a-d3448a0c6679\exec-a317f37c-796d-417e-af63-c7726dd31d94.png`
- Mobile operational concept: `C:\Users\Duncan\.codex\generated_images\01a17c33-c0cc-7371-883a-d3448a0c6679\exec-43473f5b-aca5-40b9-9d7d-bec38bf573a2.png`

Concept data is illustrative only. Production interfaces must use existing application data, routes, permissions, actions, and labels.
