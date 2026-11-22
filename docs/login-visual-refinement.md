# Login visual refinement

Updated 2026-11-21 against the supplied `RIANA CIMS Cyan Gradient Login Page.png` and its refinement brief.

## Scope and implementation

The existing login stacked the full corporate wordmark above a separate title on a predominantly white surface. The approved design calls for a single centered branding group and a cyan-blue background.

- `src/components/auth/LoginForm.tsx` reuses the existing official `public/Riana_mark_color_trimmed.png` beside the system name. The image file is unchanged. The title remains accessible text, with separate RIANA and CIMS spans; the subtitle starts beneath the title. Copyright uses the requested 2026 wording.
- `src/components/auth/LoginForm.css` adds responsive branding styles, a small inline SVG network texture clipped to RIANA, solid teal CIMS, cyan-blue gradients and an 11px slate footer. Existing corner graphics and animations remain in place. Forced-color mode restores solid readable heading text. No dependencies or raster assets were added.
- Form controls, handlers, validation, API calls, recovery, passkey and MFA logic, routing, permissions, backend and database code are unchanged.

Branding uses grid centering and container-relative typography. Safe-area padding is supported. Short pages can scroll vertically rather than clipping controls. The existing card, form dimensions and responsive control styles are intentionally preserved as required by the brief; the reference image is not used as a full-page raster replacement.

## Validation

- `npx.cmd eslint src/components/auth/LoginForm.tsx`: passed.
- `npm.cmd run typecheck`: passed, including CIMS and CRMS configurations.
- `npm.cmd run build`: passed, including production bundle verification and PWA generation.
- `npm.cmd run test:authentication`: 14 tests passed.
- `git diff --check`: passed.
- Installed Playwright Chromium used because the Browser plugin/skill is unavailable. Tested development at `http://127.0.0.1:8090/` and the production bundle at `http://127.0.0.1:8092/`.
- Viewports: 320x568, 375x667, 390x844, 430x932, 768x1024, 1366x768, 1440x900, 1920x1080, 1067x1474 (reference dimensions), and 844x390.
- At every viewport: no horizontal document overflow; logo loaded; branding group centered; subtitle aligned with title; footer below form; footer font 11px. Computed widths, heights, font sizes, padding, border radii, background images, border colors and gaps for the email input, label, submit, passkey and recovery controls matched the original stylesheet.
- Password visibility toggled both ways. Recovery dialog opened and closed with Cancel. Passkey without an email showed the existing email-required message. Empty sign-in retained native required-field validation.
- Page identity and meaningful form content confirmed, with no framework overlay or uncaught page exceptions in the completed QA runs.

## Visual comparison

Reference and browser screenshots were inspected directly. Screenshots and temporary QA scripts were kept outside committed source.

| Reference requirement | Rendered result |
| --- | --- |
| Official mark left of title | Existing geometric mark, original proportions and colors |
| Cyan RIANA with internal nodes | Static fine lines and small nodes clipped inside readable text |
| Solid dark teal CIMS on the same line | Solid teal span with no pattern or wrapping |
| Subtitle below system name | Exact copy, slate color, aligned to title start |
| Center complete branding group | Grid centers mark plus text at all tested widths |
| Cyan-blue surface with corner networks | Tinted center and stronger aqua edges; existing corner graphics retained |
| Copyright-only footer | Exact requested wording, 11px slate, existing divider retained |
| Existing form preserved | Original computed control styles confirmed at all tested sizes |

Visible copy is unchanged except for the requested fixed copyright year and removal of the full corporate wordmark image in favor of the official standalone mark. No additional tagline was introduced; the previous footer already had no platform tagline. The compact existing card/form scale is an intentional difference from the supplied full-canvas image, consistent with the instruction to preserve the form.

## Environment limitation and support

Initial visual QA encountered HTTP 500 from `/api/maintenance/status` and an aborted company-branding request. Subsequent runtime investigation identified a missing `riana_cims` database in the MySQL data directory then serving port 3306. The original data directory returned to that port during recovery investigation; after CIMS restarted, both endpoints returned HTTP 200. A live browser login with deliberately invalid test credentials now returns the expected HTTP 401 `Invalid credentials`, without the service-unavailable error. See `login-service-recovery.md` for evidence. Successful live sign-in with the user's password, MFA completion, physical passkey authentication and reset email/SMS delivery were not exercised by the agent. No deployment or remote push was performed.

For API errors, verify the configured API service separately. For a missing mark, verify `/Riana_mark_color_trimmed.png` is present in the deployed public assets. The production preview confirmed this asset loads from the built output.

## Rollback

Reverse only the changes in `src/components/auth/LoginForm.tsx` and `src/components/auth/LoginForm.css`, then rebuild with `npm.cmd run build`. No database migration, data restoration or backend rollback is needed.
