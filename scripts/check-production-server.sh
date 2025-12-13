#!/bin/bash
# Check what commit is running on production server
# Usage: ./scripts/check-production-server.sh

SERVER_IP="64.227.30.146"
SERVER_PATH="/root/marketmaker"

echo "🔍 Checking production server at $SERVER_IP..."
echo ""

# Check server commit
echo "=== Server Status ==="
ssh root@$SERVER_IP "cd $SERVER_PATH && \
  echo 'Current commit SHA:' && \
  git rev-parse HEAD && \
  echo '' && \
  echo 'Current commit short:' && \
  git rev-parse --short HEAD && \
  echo '' && \
  echo 'Current commit message:' && \
  git log -1 --pretty=format:'%s' && \
  echo '' && \
  echo 'Current commit date:' && \
  git log -1 --pretty=format:'%ci' && \
  echo '' && \
  echo '---' && \
  echo 'Fetching latest from GitHub...' && \
  git fetch origin --quiet && \
  echo 'GitHub main SHA:' && \
  git rev-parse origin/main && \
  echo 'GitHub main short:' && \
  git rev-parse --short origin/main && \
  echo '' && \
  echo '=== Comparison ===' && \
  SERVER_SHA=\$(git rev-parse HEAD) && \
  GITHUB_SHA=\$(git rev-parse origin/main) && \
  if [ \"\$SERVER_SHA\" = \"\$GITHUB_SHA\" ]; then \
    echo '✅ Server matches GitHub main'; \
  else \
    echo '❌ Server does NOT match GitHub main'; \
    echo ''; \
    echo 'Server commit:' && \
    git log -1 --oneline HEAD && \
    echo 'GitHub main commit:' && \
    git log -1 --oneline origin/main; \
  fi"

echo ""
echo "✅ Check complete!"

