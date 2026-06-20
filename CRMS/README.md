# RIANA Developers workspace

This Vite/React application is the Developers interface within RIANA CIMS. It is built with the `/developers/` base path and is served by the root Express application.

All runtime data comes from `/api/crms` and the shared MySQL `riana_cims` database. The files under `src/integrations/supabase/types.ts` are retained only as TypeScript data-shape definitions; there is no Supabase client or second runtime database.

Run commands from the repository root:

```powershell
cmd /c npm ci --prefix CRMS
cmd /c npm run build:crms
cmd /c npx tsc -p CRMS/tsconfig.app.json --noEmit
```

See the root [README](../README.md) and [architecture guide](../docs/ARCHITECTURE.md) for authentication, deployment, notifications, and database details.
