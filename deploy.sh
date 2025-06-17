#!/bin/bash

# echo "=== Starting Deployment ==="
# cd /root/marketmaker
echo "=== Checking Node Version ==="
node -v

echo "=== Installing Dependencies ==="
npm install

echo "=== Building Project ==="
npm run build

echo "=== Restarting Application ==="
pm2 restart 7

echo "=== Final PM2 Status ==="
pm2 list 