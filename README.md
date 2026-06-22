# RIANA CIMS

RIANA CIMS is the shared platform for client installations and the RIANA Developers change-request workspace. Both interfaces use one Express API and one MySQL database (`riana_cims`).

## Applications

- CIMS web interface: `/`
- Developers workspace: `/developers/`
- API and health check: `/api` and `/api/health`

Developer users are taken directly to the native Developers module after signing in. Admin and Teamlead users can open its permitted views from the same CIMS navigation; there is no iframe or second application session.

## Local setup

Requirements: Node.js 20+, npm 10+, and MySQL 8+.

```powershell
Copy-Item .env.example .env.local
cmd /c npm ci
cmd /c npm ci --prefix CRMS
cmd /c npm ci --prefix server
cmd /c node setup_db.cjs
cmd /c npm run start:all
```

Development URLs are `http://localhost:8090` for CIMS and `http://localhost:8081/developers/` for Developers. The shared API listens on port 8081.

## Verification

```powershell
cmd /c npm run db:verify-unified
cmd /c npm run db:backup:verify
cmd /c npm run notifications:verify
cmd /c npx tsc -p tsconfig.app.json --noEmit
cmd /c npx tsc -p CRMS/tsconfig.app.json --noEmit
cmd /c npm run build:all
```

`notifications:verify` uses provider mocks and sends nothing externally. Live provider testing requires an explicit destination and confirmation flag; see [Operations](docs/OPERATIONS.md).

## Production

The API serves both production frontend builds, so one Node process is sufficient. Use one of:

- PM2: `npm run build:all`, then `npx pm2 start ecosystem.config.cjs`
- Docker: `docker compose --env-file .env.local up -d --build`
- Staged host bundle: `npm run build:host` (output in ignored `release/`)

The hosting build includes `hosting/Mysql_host/riana_cims_host.sql`: the complete 27-table schema plus sanitized reference data for a clean deployment. It never includes live accounts, reset tokens, customer contacts, messages, or audit records.

Detailed guidance is in [Unified Architecture](docs/ARCHITECTURE_REFACTOR.md), [Security](docs/SECURITY.md), [Deployment](docs/DEPLOYMENT.md), [Operations](docs/OPERATIONS.md), [Administrator Guide](docs/ADMIN_GUIDE.md), [User Guide](docs/USER_GUIDE.md), [API Guide](docs/API.md), [Knowledge Base](docs/KNOWLEDGE_BASE.md), [UI/UX](docs/UI_UX.md), [Troubleshooting](docs/TROUBLESHOOTING.md), [Assistant Memory](docs/CHATBOT_MEMORY.md), and the [latest verification report](docs/VERIFICATION_REPORT.md).

## Security and secrets

Never commit `.env.local`, live database backups, uploads, or provider credentials. The tracked `Mysql_host` installer is schema-only with sanitized reference rows. Copy `.env.example`, supply production secrets outside Git, set a strong production JWT secret, use HTTPS, and restrict database access to the application host.
