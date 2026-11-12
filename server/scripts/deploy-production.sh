#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

APP_RELEASE="${1:-${APP_RELEASE:-}}"
if [[ ! "$APP_RELEASE" =~ ^[a-fA-F0-9]{40}$ ]]; then
  echo "A full Git commit SHA is required as the release argument or APP_RELEASE." >&2
  exit 1
fi
export APP_RELEASE

cd "${DEPLOY_APP_DIR:-/var/www/riana-cims/cms}"
export PATH="/root/.nvm/versions/node/v23.6.0/bin:$HOME/.nvm/versions/node/v23.6.0/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
trap 'echo "Deployment failed at line $LINENO; release was not verified." >&2' ERR

# Select one PM2 owner. Never start a second daemon or kill an arbitrary port owner.
PM2_BIN="${DEPLOY_PM2_BIN:-/root/.nvm/versions/node/v23.6.0/bin/pm2}"
case "${DEPLOY_PM2_MODE:-root}" in
  root) pm2_run() { sudo -n "$PM2_BIN" "$@"; } ;;
  user) pm2_run() { "$PM2_BIN" "$@"; } ;;
  *) echo "DEPLOY_PM2_MODE must be root or user." >&2; exit 1 ;;
esac

echo "=== Installing locked API production dependencies ==="
npm --prefix server ci --omit=dev

echo "=== Creating and verifying a pre-migration database backup ==="
mkdir -p server/backups
chmod 700 server/backups
node server/scripts/verify-backup.cjs
find server/backups -maxdepth 1 -type f -name '*.sql' -exec chmod 600 {} +

echo "=== Applying database migrations after verified backup ==="
COMMUNICATION_MIGRATION_BACKUP_VERIFIED=true node server/scripts/apply-communication-migrations.cjs

echo "=== Verifying production passkey configuration and schema ==="
NODE_ENV=production node server/scripts/verify-passkey-readiness.cjs

# The root PM2 sudo rule does not preserve arbitrary environment assignments.
# The ecosystem reads this private release marker when loading production config.
mkdir -p .runtime
printf '%s\n' "$APP_RELEASE" > .runtime/app-release

echo "=== Restarting the managed API ==="
if pm2_run describe riana-cims >/dev/null 2>&1; then
  pm2_run restart ecosystem.config.cjs --only riana-cims --env production --update-env
else
  pm2_run start ecosystem.config.cjs --only riana-cims --env production
fi

echo "=== Verifying API release and public icon ==="
node server/scripts/verify-production-runtime.cjs
pm2_run save
echo "=== Deployment verified for release $APP_RELEASE ==="
