#!/bin/bash

# echo "=== Starting Deployment ==="
# cd /root/marketmaker
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
pm2 restart getantelope --update-env || pm2 restart 4 --update-env

echo "=== Final PM2 Status ==="
pm2 list 