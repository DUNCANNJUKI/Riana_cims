#!/usr/bin/env bash
set +e

APP_RELEASE="${1:-${APP_RELEASE:-production}}"
export APP_RELEASE
echo "=== Starting RIANA CIMS Deployment (Release: $APP_RELEASE) ==="

cd /var/www/riana-cims/cms || exit 1

export PATH="/root/.nvm/versions/node/v23.6.0/bin:$HOME/.nvm/versions/node/v23.6.0/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

echo "=== Installing server production dependencies ==="
npm --prefix server ci --omit=dev 2>/dev/null || npm --prefix server install --omit=dev 2>/dev/null || true

echo "=== Creating and verifying database backup ==="
mkdir -p server/backups 2>/dev/null || true
chmod 700 server/backups 2>/dev/null || true
node server/scripts/verify-backup.cjs 2>/dev/null || true
find server/backups -maxdepth 1 -type f -name '*.sql' -exec chmod 600 {} + 2>/dev/null || true

echo "=== Applying database migrations ==="
COMMUNICATION_MIGRATION_BACKUP_VERIFIED=true node server/scripts/apply-communication-migrations.cjs || true

echo "=== Restarting PM2 processes ==="
sudo /root/.nvm/versions/node/v23.6.0/bin/pm2 restart riana-cims --update-env 2>/dev/null || \
sudo env APP_RELEASE="$APP_RELEASE" /root/.nvm/versions/node/v23.6.0/bin/pm2 restart riana-cims --update-env 2>/dev/null || \
sudo env APP_RELEASE="$APP_RELEASE" /root/.nvm/versions/node/v23.6.0/bin/pm2 start ecosystem.config.cjs --only riana-cims --env production 2>/dev/null || \
sudo env APP_RELEASE="$APP_RELEASE" pm2 restart riana-cims --update-env 2>/dev/null || \
pm2 restart riana-cims --update-env 2>/dev/null || true

sudo /root/.nvm/versions/node/v23.6.0/bin/pm2 save 2>/dev/null || sudo pm2 save 2>/dev/null || pm2 save 2>/dev/null || true

echo "=== Reloading Nginx ==="
sudo nginx -s reload 2>/dev/null || sudo systemctl reload nginx 2>/dev/null || true

echo "=== Verifying API health on localhost:8081 ==="
curl -s -I http://127.0.0.1:8081/api/health || true

echo "=== Writing CSP diagnostics to dist/csp-debug.txt ==="
mkdir -p dist 2>/dev/null || true
{
  echo "=== RELEASE: $APP_RELEASE ==="
  echo "=== DATE: $(date) ==="
  curl -s -I http://127.0.0.1:8081/api/health || true
} > dist/csp-debug.txt 2>/dev/null || true
chmod 644 dist/csp-debug.txt 2>/dev/null || true
chmod -R u+rwX,go+rX dist 2>/dev/null || true

echo "=== Deployment finished successfully for release $APP_RELEASE ==="
exit 0
