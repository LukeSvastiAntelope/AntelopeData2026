#!/bin/bash
# Quick script to check what commit is running on the production server
# Run this on the server: bash scripts/check-server-commit.sh

cd /root/marketmaker || exit 1

echo "=== Server Git Status ==="
echo "Current commit SHA: $(git rev-parse HEAD)"
echo "Current commit short: $(git rev-parse --short HEAD)"
echo "Current branch: $(git rev-parse --abbrev-ref HEAD)"
echo "Last commit message: $(git log -1 --pretty=format:'%s')"
echo "Last commit date: $(git log -1 --pretty=format:'%ci')"
echo ""
echo "=== GitHub Remote Status ==="
git fetch origin --quiet
echo "GitHub main SHA: $(git rev-parse origin/main)"
echo "GitHub main short: $(git rev-parse --short origin/main)"
echo ""
echo "=== Comparison ==="
LOCAL_SHA=$(git rev-parse HEAD)
REMOTE_SHA=$(git rev-parse origin/main)
if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
    echo "✅ Server matches GitHub main"
else
    echo "❌ Server does NOT match GitHub main"
    echo "Server is ahead by: $(git rev-list --count origin/main..HEAD) commits"
    echo "Server is behind by: $(git rev-list --count HEAD..origin/main) commits"
fi
echo ""
echo "=== Uncommitted Changes ==="
if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️  Has uncommitted changes:"
    git status --short
else
    echo "✅ No uncommitted changes"
fi

