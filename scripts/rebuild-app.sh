#!/bin/bash

# Script to rebuild the app with memory management
# Run this on your production server

echo "=== Rebuilding App ==="
echo ""

cd /root/marketmaker || exit 1

# Stop the app
echo "1. Stopping PM2 process..."
pm2 stop getantelope

# Free up memory by clearing caches
echo "2. Freeing up memory..."
sync
echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || echo "Could not clear cache (non-critical)"

# Check available memory
echo ""
echo "3. Current memory status:"
free -h

# Clean old build
echo ""
echo "4. Cleaning old build..."
rm -rf .next
rm -rf node_modules/.cache

# Build with increased memory and skip type checking
echo ""
echo "5. Building app (this may take 5-10 minutes)..."
echo "   Type checking is disabled to avoid memory issues"
NODE_OPTIONS="--max-old-space-size=4096" npm run build

# Check if build succeeded
if [ -d ".next" ] && [ -f ".next/BUILD_ID" ]; then
    echo ""
    echo "✅ Build successful!"
    
    # Restart PM2 process
    echo ""
    echo "6. Restarting PM2 process..."
    pm2 restart getantelope --update-env
    
    # Wait a moment
    sleep 3
    
    # Check status
    echo ""
    echo "7. Checking status..."
    pm2 list | grep getantelope
    
    echo ""
    echo "8. Checking if app is listening..."
    if lsof -i :3001 > /dev/null 2>&1; then
        echo "✅ App is listening on port 3001"
        echo ""
        echo "⚠️  NOTE: App is on port 3001, but nginx might expect 3000"
        echo "   Check nginx config: grep proxy_pass /etc/nginx/sites-available/default"
    else
        echo "❌ App not listening - check logs: pm2 logs getantelope --lines 50"
    fi
else
    echo ""
    echo "❌ Build failed or incomplete!"
    echo "Check the build output above for errors."
    echo ""
    echo "You can try:"
    echo "  1. Check disk space: df -h"
    echo "  2. Check memory: free -h"
    echo "  3. Try building again: npm run build"
fi

echo ""
echo "=== Done ==="

