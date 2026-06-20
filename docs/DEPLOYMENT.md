# Deployment

## Before deployment

1. Copy `.env.example` to `.env.local` and set production values.
2. Set `BREVO_FROM_EMAIL=info@riana.co` and authorize the host IP in Brevo.
3. Point `DATABASE_*` at the single `riana_cims` database.
4. Run the verification commands from the README.

## PM2 deployment

```bash
npm ci
npm ci --prefix CRMS
npm ci --prefix server
npm run build:all
npx pm2 start ecosystem.config.cjs
npx pm2 save
```

The process listens on port 8081 and serves both SPAs. Put HTTPS Nginx/Apache in front of it. An Nginx starting point is provided in `hosting/nginx.conf.example`.

## Docker deployment

```bash
docker compose --env-file .env.local up -d --build
docker compose ps
curl http://localhost:8081/api/health
```

MySQL data uses a named volume. Backups and uploads are bind-mounted so they survive container replacement.

## Updating

Pull the requested commit, install locked dependencies, rebuild both SPAs, restart the one application process, verify `/api/health`, then run a manual backup. Never copy `.env.local` into a public web root.
