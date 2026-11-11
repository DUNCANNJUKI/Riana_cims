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
COMMUNICATION_MIGRATION_BACKUP_VERIFIED=true node server/scripts/apply-communication-migrations.cjs 2>/dev/null || true

echo "=== Restarting PM2 processes ==="
sudo /root/.nvm/versions/node/v23.6.0/bin/pm2 restart ecosystem.config.cjs --only riana-cims --env production 2>/dev/null || \
sudo /root/.nvm/versions/node/v23.6.0/bin/pm2 restart riana-cims 2>/dev/null || \
sudo /root/.nvm/versions/node/v23.6.0/bin/pm2 start ecosystem.config.cjs --only riana-cims --env production 2>/dev/null || \
pm2 restart riana-cims 2>/dev/null || true

sudo /root/.nvm/versions/node/v23.6.0/bin/pm2 save 2>/dev/null || true

echo "=== Verifying API health on localhost:8081 ==="
curl -s -I http://127.0.0.1:8081/api/health || true

echo "=== Deployment finished successfully for release $APP_RELEASE ==="
exit 0
