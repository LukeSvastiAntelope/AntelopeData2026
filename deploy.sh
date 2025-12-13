#!/bin/bash
set -e

# echo "=== Starting Deployment ==="
echo "=== Deployment Info ==="
echo "Commit SHA: $(git rev-parse HEAD)"
echo "Commit short: $(git rev-parse --short HEAD)"
echo "Commit message: $(git log -1 --pretty=format:'%s')"
echo "Commit date: $(git log -1 --pretty=format:'%ci')"
echo "Branch: $(git rev-parse --abbrev-ref HEAD)"
echo ""
echo "=== Working Directory ==="
pwd
echo ""

# If this script is invoked as root (e.g., via GitHub Actions SSH),
# re-exec as appuser while preserving env vars.
if [ "$(id -u)" = "0" ] && id -u appuser >/dev/null 2>&1 && [ -z "${DEPLOY_AS_APPUSER:-}" ]; then
  export DEPLOY_AS_APPUSER=1
  exec sudo -E -u appuser -H bash -lc "cd \"$(pwd)\" && DEPLOY_AS_APPUSER=1 ./deploy.sh"
fi

echo "=== Checking Node Version ==="
node -v

echo "=== Installing Dependencies ==="
npm install

echo "=== Using runtime environment variables from GitHub Actions ==="

echo "=== DB Migration ==="
npx prisma generate 2>/dev/null || echo "Prisma not configured, skipping..."

echo "=== Running Channels Migration ==="
# Export environment variables for the migration script
export DB_HOST=${MYSQL_HOST}
export DB_USER=${MYSQL_USER}
export DB_PASSWORD=${MYSQL_PASSWORD}
export DB_NAME=${MYSQL_DATABASE}
export DB_PORT=${MYSQL_PORT}
node scripts/run-channels-migration.js || echo "Migration completed or tables already exist"

echo "=== Building Project ==="
NODE_OPTIONS="--max-old-space-size=4096" npm run build

echo "=== Restarting Application with updated env ==="
if ! pm2 describe getantelope >/dev/null 2>&1; then
  echo "PM2 process 'getantelope' not found; starting it..."
  PORT=${PORT:-3000} NODE_ENV=${NODE_ENV:-production} pm2 start npm --name getantelope -- start
  pm2 save || true
else
  pm2 restart getantelope --update-env || true
fi

echo "=== Final PM2 Status ==="
pm2 list