# Fix for 413 Request Entity Too Large Error

## Problem
When uploading CSV files larger than ~1-2MB, you get a `413 Request Entity Too Large` error.

## Root Cause
The error is typically caused by:
1. **Nginx reverse proxy** (most common) - default limit is 1MB
2. **Next.js server** - no built-in body size limit, but reverse proxy limits apply

## Solution

### 1. Code Changes (Already Applied)
- ✅ Lowered chunking threshold from 2MB to 1MB
- ✅ Added route segment configs for larger timeouts
- Files > 1MB will now be automatically chunked

### 2. Server Configuration Required

#### For Nginx (Most Common)

SSH into your production server and update your nginx configuration:

```bash
# Edit your nginx site config
sudo nano /etc/nginx/sites-available/your-site-name
# or
sudo nano /etc/nginx/nginx.conf
```

Add or update these settings in your `server` block:

```nginx
server {
    # ... existing config ...
    
    # Increase client body size limit to 50MB
    client_max_body_size 50M;
    
    # Increase buffer sizes
    client_body_buffer_size 128k;
    client_header_buffer_size 1k;
    large_client_header_buffers 4 16k;
    
    # Increase timeouts
    client_body_timeout 300s;
    client_header_timeout 300s;
    send_timeout 300s;
    
    location / {
        proxy_pass http://localhost:3000;
        # ... existing proxy settings ...
        
        # Increase proxy timeouts
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
```

Then reload nginx:
```bash
sudo nginx -t  # Test configuration
sudo systemctl reload nginx  # Reload nginx
```

#### For PM2/Node.js Direct (No Nginx)

If you're running Next.js directly without nginx, you may need to set environment variables:

```bash
# In your PM2 ecosystem file or .env
NODE_OPTIONS="--max-old-space-size=4096"
```

### 3. Verify the Fix

1. **Test with a 2MB CSV file** - it should now chunk automatically
2. **Check browser console** - you should see chunked upload progress
3. **Monitor server logs** - check for any remaining errors

### 4. Quick Test

```bash
# On your production server, test nginx config
curl -X POST https://your-domain.com/api/surveys/import \
  -H "Content-Type: multipart/form-data" \
  -F "file=@test-file.csv" \
  -F "x-user-id=1"
```

## Files Changed

1. `src/app/utils/file-chunking.ts` - Lowered chunking threshold to 1MB
2. `src/app/api/surveys/import/route.ts` - Added maxDuration and runtime config
3. `src/app/api/surveys/import/chunk/route.ts` - Added maxDuration and runtime config
4. `src/app/api/public/surveys/preview/route.ts` - Added maxDuration and runtime config

## Notes

- Chunked uploads are already implemented in the frontend
- Files > 1MB will automatically be split into chunks
- Each chunk is limited to 5MB (configurable in route handlers)
- The nginx configuration is the most critical fix for production

