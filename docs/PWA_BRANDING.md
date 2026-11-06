# PWA company branding

The install manifest, browser favicon, and Apple touch icon use the public
`/api/public/company-pwa-icon/:size.png` endpoint. Supported sizes are 180, 192,
and 512 pixels. The API generates square PNG artwork from the logo referenced by
`company_settings` on a transparent canvas, without a border or badge. Logo
uploads are resolved through the existing upload safety helper and are accepted
only when the company settings row references that file. The global API policy
allows only those three icon sizes without authentication. Remote logo URLs are
not fetched server-side.

If an uploaded logo is absent or unavailable, generated icons fall back to the
standalone color mark in `Riana_mark_color_trimmed.png`. The in-app startup loader separately reads the
public company branding endpoint and animates the configured logo and company
name alongside the network activity graphic. It retains the bundled RIANA mark
when the branding endpoint is unavailable and honors reduced-motion settings.
The standalone mark appears directly in the network graphic without an outline
or framed background.

PWA launch icons are static images as required by platform launchers. When the
company logo changes, a newly generated icon is visible after its five-minute
server cache expires; users with an already-installed PWA may need their device
to refresh the installed icon.

The GitLab production deployment applies or confirms the chat/call prerequisite
migrations and verifies all five migration records, required call tables, and
required call columns/statuses before restart. After restart it checks
the API release SHA and fetches the public 192-pixel icon, including its PNG
signature, before reporting a successful deployment.
