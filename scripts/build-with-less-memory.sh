#!/bin/bash

# Build script that uses less memory to avoid OOM kills
# Run this on your production server

echo "=== Building with Reduced Memory ==="
echo ""

# Prefer common deployment locations; allow override via APP_DIR
APP_DIR="${APP_DIR:-}"
if [ -z "$APP_DIR" ]; then
  if [ -d "/home/appuser/marketmaker" ]; then
    APP_DIR="/home/appuser/marketmaker"
  elif [ -d "/root/marketmaker" ]; then
    APP_DIR="/root/marketmaker"
  else
    echo "Could not find app directory. Set APP_DIR=/path/to/app"
    exit 1
  fi
fi

cd "$APP_DIR" || exit 1

# Check available memory
echo "1. Current memory status:"
free -h
echo ""

# Stop the app
echo "2. Stopping PM2 process..."
if id -u appuser >/dev/null 2>&1; then
  su - appuser -c "pm2 stop getantelope" || true
else
  pm2 stop getantelope || true
fi

# Clean old build
echo "3. Cleaning old build..."
rm -rf .next
rm -rf node_modules/.cache

# Build with less memory (2GB instead of 4GB to leave room for OS)
echo "4. Building app with 2GB memory limit..."
echo "   (This may take longer but should avoid OOM kills)"
NODE_OPTIONS="--max-old-space-size=2048" npm run build

# Check if build succeeded
if [ -d ".next" ] && [ -f ".next/BUILD_ID" ]; then
    echo ""
    echo "✅ Build successful!"
    
    # Restart PM2 process
    echo ""
    echo "5. Restarting PM2 process..."
    if id -u appuser >/dev/null 2>&1; then
        su - appuser -c "pm2 restart getantelope --update-env"
    else
        pm2 restart getantelope --update-env
    fi
    
    # Wait a moment
    sleep 3
    
    # Check status
    echo ""
    echo "6. Checking status..."
    if id -u appuser >/dev/null 2>&1; then
        su - appuser -c "pm2 list" | grep getantelope
    else
        pm2 list | grep getantelope
    fi
    
    echo ""
    echo "7. Verifying build..."
    if [ -f ".next/BUILD_ID" ]; then
        echo "✅ Build ID exists: $(cat .next/BUILD_ID)"
    fi
else
    echo ""
    echo "❌ Build failed or incomplete!"
    echo "Check memory: free -h"
    echo "Check disk space: df -h"
fi

echo ""
echo "=== Done ==="

