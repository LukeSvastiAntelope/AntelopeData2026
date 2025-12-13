#!/bin/bash

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
echo "=== Checking Node Version ==="
node -v

echo "=== Installing Dependencies ==="
if id -u appuser >/dev/null 2>&1; then
  su - appuser -c "cd \"$(pwd)\" && npm install"
else
  npm install
fi

echo "=== Using runtime environment variables from GitHub Actions ==="

echo "=== DB Migration ==="
if id -u appuser >/dev/null 2>&1; then
  su - appuser -c "cd \"$(pwd)\" && npx prisma generate" 2>/dev/null || echo "Prisma not configured, skipping..."
else
  npx prisma generate 2>/dev/null || echo "Prisma not configured, skipping..."
fi

echo "=== Running Channels Migration ==="
# Export environment variables for the migration script
export DB_HOST=${MYSQL_HOST}
export DB_USER=${MYSQL_USER}
export DB_PASSWORD=${MYSQL_PASSWORD}
export DB_NAME=${MYSQL_DATABASE}
export DB_PORT=${MYSQL_PORT}
if id -u appuser >/dev/null 2>&1; then
  su - appuser -c "cd \"$(pwd)\" && node scripts/run-channels-migration.js" || echo "Migration completed or tables already exist"
else
  node scripts/run-channels-migration.js || echo "Migration completed or tables already exist"
fi

echo "=== Building Project ==="
if id -u appuser >/dev/null 2>&1; then
  su - appuser -c "cd \"$(pwd)\" && NODE_OPTIONS=\"--max-old-space-size=4096\" npm run build"
else
  NODE_OPTIONS="--max-old-space-size=4096" npm run build
fi

echo "=== Restarting Application with updated env ==="
if id -u appuser >/dev/null 2>&1; then
  su - appuser -c "pm2 restart getantelope --update-env" || true
else
  pm2 restart getantelope --update-env || pm2 restart 4 --update-env
fi

echo "=== Final PM2 Status ==="
if id -u appuser >/dev/null 2>&1; then
  su - appuser -c "pm2 list"
else
  pm2 list
fi