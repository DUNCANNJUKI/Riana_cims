# UI and Document Standard

## Interface

The CIMS shell is canonical. It provides the only header, sidebar, footer, notification surface, content scroll region, and session warning. CRMS pages inherit the root font scale and tokens.

- Primary identity: RIANA teal `#0D8390`
- Body text: dark neutral with WCAG-readable contrast
- Green: success/completed state only
- Amber: warning/pending state only
- Red: destructive/error state only
- Base body size: 14–16 px; page headings: 24–30 px; dense table text: at least 12 px

Do not hard-code a second brand palette or embed another application shell.

CRMS/Developers navigation must not expose separate Settings, Notifications, or user-management screens. Those are owned by main CIMS. The Developers overview uses the same CIMS card surfaces, borders, shadows, readable foreground text, and primary teal actions in both light and dark themes.

## Generated documents

PDFs use a restrained teal header, white header text, dark body text, light neutral table stripes, serial number, generation time, page number, confidentiality label, subsidiary/company identity, and reserved footer space. Watermarks must remain subtle enough that body text stays readable. Status colors never replace status text.

Preview and download must use the same protected source file so users cannot review one version and save another.
