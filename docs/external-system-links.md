# External system links

Updated 2026-11-21.

The sidebar's **RIANA OPTIMUS** item opens `https://optimusv2.rianadevelopment.com` in a new tab. The previous `/auth/login` path is no longer appended. Existing role visibility, redirection notice and opening behavior are preserved.

The link is configured in `src/components/layout/Sidebar.tsx`. Destination authentication is handled by Optimus.
