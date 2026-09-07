#!/bin/bash

# Script to fix nginx upload size limit for file uploads
# Run this on your production server: sudo bash scripts/fix-nginx-upload-limit.sh

echo "=== Fixing Nginx Upload Size Limit ==="

# Find nginx config file (common locations)
NGINX_CONF=""
if [ -f "/etc/nginx/sites-available/default" ]; then
    NGINX_CONF="/etc/nginx/sites-available/default"
elif [ -f "/etc/nginx/nginx.conf" ]; then
    NGINX_CONF="/etc/nginx/nginx.conf"
else
    echo "❌ Could not find nginx configuration file"
    echo "Please manually edit your nginx config and add:"
    echo "  client_max_body_size 50M;"
    exit 1
fi

echo "Found nginx config: $NGINX_CONF"

# Backup original config
BACKUP_FILE="${NGINX_CONF}.backup.$(date +%Y%m%d_%H%M%S)"
cp "$NGINX_CONF" "$BACKUP_FILE"
echo "✅ Backed up config to: $BACKUP_FILE"

# Check if client_max_body_size already exists
if grep -q "client_max_body_size" "$NGINX_CONF"; then
    echo "⚠️  client_max_body_size already exists, updating..."
    sed -i 's/client_max_body_size.*/client_max_body_size 50M;/' "$NGINX_CONF"
else
    echo "Adding client_max_body_size to server block..."
    # Add after first server { line
    sed -i '/^server {/a\    client_max_body_size 50M;' "$NGINX_CONF"
fi

# Test nginx configuration
echo "=== Testing nginx configuration ==="
if nginx -t; then
    echo "✅ Nginx configuration is valid"
    echo "=== Reloading nginx ==="
    systemctl reload nginx
    echo "✅ Nginx reloaded successfully"
    echo ""
    echo "Upload size limit has been increased to 50MB"
else
    echo "❌ Nginx configuration test failed"
    echo "Restoring backup..."
    cp "$BACKUP_FILE" "$NGINX_CONF"
    exit 1
fi

