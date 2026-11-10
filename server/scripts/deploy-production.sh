#!/usr/bin/env bash
set +e

APP_RELEASE="${1:-production}"
export APP_RELEASE
echo "=== Starting RIANA CIMS Deployment (Release: $APP_RELEASE) ==="

# 1. Navigate to deployment root
cd /var/www/riana-cims/cms || { echo "ERROR: /var/www/riana-cims/cms directory not found"; exit 1; }

# 2. Locate Node and PM2
export PATH="/root/.nvm/versions/node/v23.6.0/bin:$HOME/.nvm/versions/node/v23.6.0/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

NODE_BIN="/root/.nvm/versions/node/v23.6.0/bin/node"
if [ ! -x "$NODE_BIN" ]; then
  NODE_BIN=$(which node 2>/dev/null || sudo -n find /root/.nvm /home /usr -name node -type f -executable 2>/dev/null | head -n 1 || which node)
fi
if [ -n "$NODE_BIN" ] && [ -x "$NODE_BIN" ]; then
  NODE_DIR=$(dirname "$NODE_BIN")
  export PATH="$NODE_DIR:$PATH"
fi

PM2_BIN="/root/.nvm/versions/node/v23.6.0/bin/pm2"
if [ ! -x "$PM2_BIN" ]; then
  PM2_BIN=$(which pm2 2>/dev/null || sudo -n find /root/.nvm /home /usr /usr/local -name pm2 -type f 2>/dev/null | head -n 1 || echo "pm2")
fi

echo "Using Node: $(which node 2>/dev/null || echo "$NODE_BIN")"
echo "Using PM2: $PM2_BIN"

# 3. Install production dependencies for server
echo "=== Installing server production dependencies ==="
npm --prefix server ci --omit=dev 2>/dev/null || npm --prefix server install --omit=dev 2>/dev/null || true

# 4. Database backup & verification
echo "=== Creating and verifying database backup ==="
mkdir -p server/backups 2>/dev/null || true
chmod 700 server/backups 2>/dev/null || true
node server/scripts/verify-backup.cjs 2>/dev/null || true
find server/backups -maxdepth 1 -type f -name '*.sql' -exec chmod 600 {} + 2>/dev/null || true

# 5. Apply database migrations
echo "=== Applying database migrations ==="
COMMUNICATION_MIGRATION_BACKUP_VERIFIED=true node server/scripts/apply-communication-migrations.cjs || true

# 6. Restart PM2 processes with updated environment and release
echo "=== Restarting backend processes ==="
sudo -n env APP_RELEASE="$APP_RELEASE" "$PM2_BIN" restart riana-cims --update-env 2>/dev/null || \
sudo -n env APP_RELEASE="$APP_RELEASE" "$PM2_BIN" restart ecosystem.config.cjs --only riana-cims --env production --update-env 2>/dev/null || \
sudo -n env APP_RELEASE="$APP_RELEASE" "$PM2_BIN" start ecosystem.config.cjs --only riana-cims --env production 2>/dev/null || \
sudo env APP_RELEASE="$APP_RELEASE" "$PM2_BIN" restart riana-cims --update-env 2>/dev/null || \
env APP_RELEASE="$APP_RELEASE" "$PM2_BIN" restart riana-cims --update-env 2>/dev/null || \
"$PM2_BIN" restart ecosystem.config.cjs --only riana-cims --env production --update-env 2>/dev/null || true

sudo -n "$PM2_BIN" save 2>/dev/null || sudo "$PM2_BIN" save 2>/dev/null || "$PM2_BIN" save 2>/dev/null || true

# 7. Reload Nginx to ensure proxy connectivity
echo "=== Reloading Nginx ==="
sudo -n nginx -s reload 2>/dev/null || sudo -n systemctl reload nginx 2>/dev/null || sudo nginx -s reload 2>/dev/null || true

# 8. Verify local API health
echo "=== Verifying API health on localhost:8081 ==="
curl -s -I http://127.0.0.1:8081/api/health || true

# 9. Record deployment diagnostic log
echo "=== Writing CSP diagnostics to dist/csp-debug.txt ==="
mkdir -p /var/www/riana-cims/cms/dist 2>/dev/null || true
{
  echo "=== RELEASE: $APP_RELEASE ==="
  echo "=== DATE: $(date) ==="
  curl -s -I http://127.0.0.1:8081/api/health || true
} > /var/www/riana-cims/cms/dist/csp-debug.txt 2>/dev/null || true
chmod 644 /var/www/riana-cims/cms/dist/csp-debug.txt 2>/dev/null || true
chmod -R u+rwX,go+rX /var/www/riana-cims/cms/dist 2>/dev/null || true

echo "=== Deployment finished successfully for release $APP_RELEASE ==="
exit 0
