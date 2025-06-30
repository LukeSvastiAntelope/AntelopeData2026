#!/bin/bash

# echo "=== Starting Deployment ==="
# cd /root/marketmaker
echo "=== Checking Node Version ==="
node -v

echo "=== Installing Dependencies ==="
npm install

echo "=== DB Migration ==="
npx prisma generate

echo "=== Building Project ==="
NODE_OPTIONS="--max-old-space-size=4096" npm run build

echo "=== Restarting Application ==="
pm2 restart 4

echo "=== Final PM2 Status ==="
pm2 list 