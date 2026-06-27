# UI and Document Standard

## Interface

The CIMS shell is canonical. It provides the only header, sidebar, footer, notification surface, content scroll region, and session warning. CRMS pages inherit the root font scale and tokens.

The application header uses a 72 px enterprise layout on desktop with a transparent RIANA mark, a two-line title block, a restrained teal gradient, and consistently spaced 20 px actions. The compact mobile header keeps the same mark and title hierarchy without changing navigation, notifications, profile, chat, theme, or session behavior.

The Super Admin badge uses a high-contrast red surface and readable “Super Admin” label. Management and Finance use distinct accessible role colors. Recent Activity is disclosure-based and hidden until Recents is selected. Developers includes a role-aware Pending tab and developer-name report filter.

Read-only roles do not receive add, edit, status, upload, assignment, or delete controls. The API enforces the same restrictions; hidden controls are not authorization.

- Primary identity: RIANA teal `#0D8390`
- Body text: dark neutral with WCAG-readable contrast
- Green: success/completed state only
- Amber: warning/pending state only
- Red: destructive/error state only
- Base body size: 14–16 px; page headings: 24–30 px; dense table text: at least 12 px

Do not hard-code an independent palette in a page or embed another application shell. The shell always retains the canonical RIANA logo, name, footer, and palette for every subsidiary. MAREZI identity is document-only.

CRMS/Developers navigation must not expose separate Settings, Notifications, or user-management screens. Those are owned by main CIMS. The Developers overview uses the same CIMS card surfaces, borders, shadows, readable foreground text, and primary teal actions in both light and dark themes.

## Generated documents

RIANA PDFs use a restrained teal header matched to the official logo edge tone, white header text, dark body text, light neutral table stripes, serial number, generation time, page number, confidentiality label, and reserved footer space. MAREZI PDFs use the approved full-page transparent MAREZI letterhead on every page; titles begin below its top rule and content stays above its footer. Continuation content starts at 40 mm and tables reserve 45 mm at the bottom on both identities.

Each generated report name appears once in the branded header. Do not repeat the report name as a black body heading; body content starts with metadata, a section heading, or the report table.

Header logos must be aspect-ratio contained inside the reserved logo slot and must not be stretched, boxed, duplicated, or overlaid as an extra floating image. The unchanged MAREZI asset is used only as document letterhead when either the client/request or generating user belongs to MAREZI. Watermarks must remain subtle enough that body text stays readable. Status colors never replace status text.

Preview and download must use the same protected source file so users cannot review one version and save another.
