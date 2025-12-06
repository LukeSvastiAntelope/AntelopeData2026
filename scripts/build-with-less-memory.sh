#!/bin/bash

# Build script that uses less memory to avoid OOM kills
# Run this on your production server

echo "=== Building with Reduced Memory ==="
echo ""

cd /root/marketmaker || exit 1

# Check available memory
echo "1. Current memory status:"
free -h
echo ""

# Stop the app
echo "2. Stopping PM2 process..."
pm2 stop getantelope

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
    pm2 restart getantelope --update-env
    
    # Wait a moment
    sleep 3
    
    # Check status
    echo ""
    echo "6. Checking status..."
    pm2 list | grep getantelope
    
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

