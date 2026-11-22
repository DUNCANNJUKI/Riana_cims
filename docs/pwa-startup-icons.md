# PWA startup icon correction

22 November 2026, Africa/Nairobi

## Diagnosis

The production manifest configuration used a dynamically generated transparent 512px PNG with `purpose: maskable`, and supplied only a 192px `any` icon. Inspection of the actual local `/api/public/company-pwa-icon/512.png` response found 226,352 fully transparent pixels and no opaque near-black pixels. The black square is not painted into the current source PNG or produced by login CSS. Transparent artwork incorrectly advertised as maskable is a verified configuration defect consistent with a platform-supplied icon background; a physical Android capture is still needed to confirm the exact rendering on the reported device.

The configured original logo is byte-identical to `public/Riana_mark_transparent.png` (SHA-256 `ce5eda97767d4d667838beb1fe9d04500828948ced1c1d05b624d387e80a2e43`). Its native resolution is 100x146. It is preserved unchanged, including colours and alpha. PNG resizing uses uniform Lanczos scaling; it cannot add detail absent from that original. No logo redesign, recolouring, border or shadow is introduced.

## Correction

- Preserve the existing splash/background colour `#086f76` and align the HTML theme-colour metadata with it.
- Supply both 192px and 512px transparent `any` icons. Separately supply an opaque 512px `maskable` icon whose entire background matches the splash teal. Artwork stays inside Android's circular safe zone (radius 40% of the canvas).
- Use that same teal-backed rendering for the existing 180px Apple touch icon to avoid platform black-filling of transparency.
- Keep the existing company-logo lookup, path restrictions and endpoint URLs. Manifest icons still follow configured company branding. Only image rendering inside the PWA endpoint changes; authentication, routes and unrelated UI do not change.
- Export an unchanged transparent source logo and reproducible PNG variants in `public/pwa/` using `node scripts/generate-pwa-icons.cjs`. These bundled exports match the currently configured original and are precached; the dynamic endpoint continues to support later company-logo changes.
- Version manifest, shortcut and touch-icon URLs with `splash-20261122-2`. The icon-specific NetworkFirst cache precedes the existing API NetworkOnly rule. It refreshes online and supports cached offline startup, bounded to 12 entries/30 days. HTTP responses require revalidation. All other API/image/model caching rules and the existing worker registration/update lifecycle are preserved. User storage and unrelated caches are not cleared.

This intentionally distinguishes a transparent logo from an Android adaptive icon: the latter needs a full opaque background, matching splash teal so it does not form a contrasting square. See [Android maskable icon guidance](https://web.dev/articles/maskable-icon), [Chrome splash generation](https://developer.chrome.com/docs/lighthouse/pwa/splash-screen) and [Vite PWA static asset precaching](https://vite-pwa-org.netlify.app/guide/static-assets).

## Verification

- Five renderer tests pass: supported sizes, PNG alpha/centring, original-source preservation, absence of opaque black pixels, opaque teal adaptive background, circular safe zone, invalid size/purpose rejection.
- Twelve existing API security tests pass, including the public PWA-icon route allowlist.
- CIMS and standalone CRMS production builds, TypeScript checks, Node syntax validation and focused configuration lint pass. No lint errors or warnings.
- Chromium CDP parses the generated production manifest with no errors. App identity, scope, start URL, display mode and background remain unchanged.
- Actual local endpoint responses return correctly sized PNGs and revalidation headers; API health returns HTTP 200 after loading the updated renderer.
- An isolated local Chromium context installs the generated production worker, fetches all manifest icons, goes offline, and verifies byte-identical dynamic icons from the dedicated cache plus the exported PNG from the precache. No page exceptions.
- Phone (390x844) and desktop (1366x768) asset-composition previews were visually reviewed. These show the real generated maskable PNG on splash teal; they are previews, not native Android launch captures. Browser plugin unavailable; installed Playwright used. Temporary browser harness, JSON results and screenshots are under ignored `.runtime/pwa-*` paths.
- Git diff confirms no changes to `src/`, `CRMS/src/` or original logo files. No database, login, authentication, application workflow, push-handler or navigation changes.

## Installation and rollback

Only the local managed API was restarted for endpoint verification. This change has not been published or deployed. Deploy frontend and API together so the new maskable URL receives the updated renderer. Existing installs must receive the updated worker/manifest; Android's installed WebAPK/launcher metadata refresh is OS-managed and may lag the website. After deployment, reopen the online installed app and relaunch it; if an older icon remains, reinstall the PWA after preserving any user-managed offline work. No application-data clearing is required by this fix.

Physical Android startup and Safari/iOS home-screen presentation remain unverified; Chrome's manifest parser and mobile viewport emulation do not certify native OS splash behaviour. Browser/OS controls icon masking and startup composition.

Rollback only `index.html` PWA metadata, the PWA portions of `vite.config.ts`, the PWA endpoint renderer call in `server/index.js`, and the added PWA renderer/export files. Restore frontend and API as a matched release. No database rollback is needed; keep all unrelated responsiveness and client-request changes.
