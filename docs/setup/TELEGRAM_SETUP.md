# Telegram Integration Setup Guide

## Issue Diagnosis

Based on the console errors you're seeing:

```
❌ Error: PUBLIC_BASE_URL not configured
/api/channels/telegram/status:1 Failed to load resource: the server responded with a status of 500 (Internal Server Error)
/api/channels/telegram/connect:1 Failed to load resource: the server responded with a status of 500 (Internal Server Error)
```

## Root Cause

The Telegram integration requires several environment variables that are missing in your production deployment.

## Required Environment Variables

Add these to your `.env` file or deployment environment:

```bash
# REQUIRED: Base URL for your application
PUBLIC_BASE_URL=https://your-domain.com
NEXT_PUBLIC_APP_URL=https://your-domain.com

# REQUIRED: Encryption key for storing bot tokens securely (64-char hex)
SECURE_STORAGE_KEY=your-64-character-hex-encryption-key-here

# REQUIRED: Secret token for Telegram webhook validation
TELEGRAM_WEBHOOK_SECRET=your-telegram-webhook-secret-here

# OPTIONAL: Debug settings
TELEGRAM_DEBUG=0
TELEGRAM_TEST_MODE=0
```

## Quick Setup Commands

### 1. Generate Secure Keys

```bash
# Generate encryption key
echo "SECURE_STORAGE_KEY=$(openssl rand -hex 32)"

# Generate webhook secret  
echo "TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 32)"
```

### 2. Run Database Migration

```bash
node scripts/run-channels-migration.js
```

### 3. Check Your Setup

```bash
node scripts/check-telegram-setup.js
```

## Step-by-Step Fix

### For Local Development:

1. **Add to your `.env.local` file:**
```bash
PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
SECURE_STORAGE_KEY=$(openssl rand -hex 32)
TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 32)
```

2. **Run the migration:**
```bash
node scripts/run-channels-migration.js
```

3. **Restart your dev server:**
```bash
npm run dev
```

### For Production Deployment:

1. **Add environment variables to your hosting platform:**
   - Vercel: Add to Environment Variables in dashboard
   - Railway: Add to Variables tab
   - Heroku: Use `heroku config:set`
   - Self-hosted: Add to your `.env` file

2. **Example production values:**
```bash
PUBLIC_BASE_URL=https://yourdomain.com
NEXT_PUBLIC_APP_URL=https://yourdomain.com
SECURE_STORAGE_KEY=abcd1234...64chars...xyz789
TELEGRAM_WEBHOOK_SECRET=secret123...64chars...abc789
```

3. **Run migration on production database:**
```bash
# If using a database migration system
node scripts/run-channels-migration.js

# Or manually execute the SQL
# See migrations/20250201_add_channels_tables.sql
```

4. **Redeploy your application**

## Testing the Fix

1. Visit `/channels/new?provider=telegram`
2. You should see the Telegram setup form without console errors
3. Create a Telegram bot via [@BotFather](https://t.me/BotFather)
4. Test the bot token connection

## Troubleshooting

### Still getting 500 errors?

1. **Check database tables exist:**
```bash
node scripts/check-telegram-setup.js
```

2. **Verify environment variables:**
```bash
# In your app, check these are set:
console.log('PUBLIC_BASE_URL:', process.env.PUBLIC_BASE_URL)
console.log('SECURE_STORAGE_KEY length:', process.env.SECURE_STORAGE_KEY?.length)
```

3. **Check server logs for detailed errors**

### Database connection issues?

Make sure these are set correctly:
- `DB_HOST`
- `DB_USER` 
- `DB_PASSWORD`
- `DB_NAME`

## Security Notes

- **Never commit** `SECURE_STORAGE_KEY` or `TELEGRAM_WEBHOOK_SECRET` to version control
- Use different keys for development and production
- Store securely in your deployment platform's environment variables
- Keys should be exactly 64 characters (32 bytes in hex)

## What These Variables Do

- **`PUBLIC_BASE_URL`**: Used to generate webhook URLs for Telegram to call back to your app
- **`SECURE_STORAGE_KEY`**: Encrypts bot tokens before storing in database
- **`TELEGRAM_WEBHOOK_SECRET`**: Validates that webhook calls are actually from Telegram
- **`NEXT_PUBLIC_APP_URL`**: Used in digital twin links sent to users
