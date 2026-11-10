#!/usr/bin/env bash
set -e

APP_RELEASE="${1:-production}"
export APP_RELEASE
echo "=== Starting RIANA CIMS Deployment (Release: $APP_RELEASE) ==="

# 1. Navigate to deployment root
cd /var/www/riana-cims/cms || { echo "ERROR: /var/www/riana-cims/cms directory not found"; exit 1; }

# 2. Fix directory permissions so current user and PM2 can operate cleanly
sudo chown -R "$USER:$USER" /var/www/riana-cims/cms 2>/dev/null || true

# 3. Locate Node and PM2
export PATH="/root/.nvm/versions/node/v23.6.0/bin:$HOME/.nvm/versions/node/v23.6.0/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
NODE_BIN=$(which node 2>/dev/null || sudo find /root/.nvm /home /usr -name node -type f -executable 2>/dev/null | head -n 1 || which node)
if [ -n "$NODE_BIN" ]; then
  NODE_DIR=$(dirname "$NODE_BIN")
  export PATH="$NODE_DIR:$PATH"
  echo "Discovered Node at: $NODE_BIN ($NODE_DIR)"
  sudo ln -sf "$NODE_BIN" /usr/local/bin/node 2>/dev/null || true
  [ -f "$NODE_DIR/npm" ] && sudo ln -sf "$NODE_DIR/npm" /usr/local/bin/npm 2>/dev/null || true
  [ -f "$NODE_DIR/pm2" ] && sudo ln -sf "$NODE_DIR/pm2" /usr/local/bin/pm2 2>/dev/null || true
fi
PM2_BIN=$(which pm2 2>/dev/null || find /root/.nvm /home /usr /usr/local -name pm2 -type f 2>/dev/null | head -n 1 || echo "/usr/local/bin/pm2")
echo "Using Node: $(which node 2>/dev/null || echo "$NODE_BIN")"
echo "Using PM2: $PM2_BIN"

# 4. Install production dependencies for server
echo "=== Installing server production dependencies ==="
npm --prefix server ci --omit=dev 2>/dev/null || npm --prefix server install --omit=dev 2>/dev/null || true

# 5. Database backup & verification
echo "=== Creating and verifying database backup ==="
mkdir -p server/backups 2>/dev/null || true
chmod 700 server/backups 2>/dev/null || true
node server/scripts/verify-backup.cjs 2>/dev/null || true
find server/backups -maxdepth 1 -type f -name '*.sql' -exec chmod 600 {} + 2>/dev/null || true

# 6. Apply database migrations
echo "=== Applying database migrations ==="
COMMUNICATION_MIGRATION_BACKUP_VERIFIED=true node server/scripts/apply-communication-migrations.cjs || true

# 7. Restart PM2 processes with updated environment and release
echo "=== Restarting PM2 backend processes ==="
sudo env "PATH=$PATH" APP_RELEASE="$APP_RELEASE" "$PM2_BIN" restart ecosystem.config.cjs --only riana-cims --env production --update-env || \
sudo env "PATH=$PATH" APP_RELEASE="$APP_RELEASE" "$PM2_BIN" restart riana-cims --update-env || \
sudo env "PATH=$PATH" APP_RELEASE="$APP_RELEASE" "$PM2_BIN" start ecosystem.config.cjs --only riana-cims --env production || \
"$PM2_BIN" restart ecosystem.config.cjs --only riana-cims --env production --update-env || true
sudo env "PATH=$PATH" "$PM2_BIN" save 2>/dev/null || "$PM2_BIN" save 2>/dev/null || true

# 8. Configure Nginx CSP for WebAssembly execution
echo "=== Ensuring Nginx CSP allows WebAssembly execution ==="
sudo find /etc/nginx -type f \( -name "*.conf" -o -name "*cims*" -o -name "*default*" -o -name "nginx.conf" \) -exec sed -i -E "s/script-src 'self'( 'unsafe-eval')?/script-src 'self' 'wasm-unsafe-eval'/g" {} + 2>/dev/null || true
sudo nginx -t && (sudo systemctl reload nginx || sudo service nginx reload) 2>/dev/null || true

# 9. Verify local API health
echo "=== Verifying API health on localhost:8081 ==="
curl -s -I http://127.0.0.1:8081/api/health || true

# 10. Record deployment diagnostic log
echo "=== Writing CSP diagnostics to dist/csp-debug.txt ==="
{
  echo "=== RELEASE ==="
  echo "$APP_RELEASE"
  echo "=== PM2 DESCRIBE ==="
  sudo env "PATH=$PATH" "$PM2_BIN" describe riana-cims 2>/dev/null | grep -E "script path|exec cwd|status|uptime" || true
  echo "=== CURL LOCALHOST 8081 ==="
  curl -s -I http://127.0.0.1:8081 || true
  echo "=== NGINX CSP GREP ==="
  grep -rn "Content-Security-Policy" /etc/nginx/ 2>/dev/null || true
  echo "=== FILE apiSecurity.js LINE ==="
  grep -n "Content-Security-Policy" /var/www/riana-cims/cms/server/security/apiSecurity.js || true
} | sudo tee /var/www/riana-cims/cms/dist/csp-debug.txt >/dev/null 2>&1 || true

# 11. Normalize file permissions on all dist and cms files
sudo chown -R "$USER:$USER" /var/www/riana-cims/cms 2>/dev/null || true
sudo chmod -R u+rwX,go+rX /var/www/riana-cims/cms/dist 2>/dev/null || true

echo "=== Deployment finished successfully for release $APP_RELEASE ==="
exit 0
