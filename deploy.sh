#!/bin/bash

# echo "=== Starting Deployment ==="
# cd /root/marketmaker
echo "=== Checking Node Version ==="
node -v

echo "=== Installing Dependencies ==="
npm ci

echo "=== Setting up Environment Variables ==="
# Create .env file for production
cat > .env << EOF
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://getantelope.com
ENVIRONMENT_MODE=production
HOUSE_FEE_RATE=1
CREDIT_BALANCE=1000

# Database
DB_HOST=${MYSQL_HOST}
DB_USER=${MYSQL_USER}
DB_PASSWORD=${MYSQL_PASSWORD}
DB_NAME=${MYSQL_DATABASE}
DB_PORT=${MYSQL_PORT}

# API Keys
JWT_SECRET=${JWT_SECRET}
OPENAI_API_KEY=${OPENAI_API_KEY}
DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
GEMINI_API_KEY=${GEMINI_API_KEY}
SERPAPI_API_KEY=${SERPAPI_API_KEY}
PINECONE_API_KEY=${PINECONE_API_KEY}
COINMARKETCAP_API_KEY=${COINMARKETCAP_API_KEY}

# Telegram (Legacy)
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
TELEGRAM_BOT_USERNAME=${TELEGRAM_BOT_USERNAME}
TELEGRAM_CHANNEL_ID=${TELEGRAM_CHANNEL_ID}

# New Telegram Integration
PUBLIC_BASE_URL=${PUBLIC_BASE_URL}
SECURE_STORAGE_KEY=${SECURE_STORAGE_KEY}
TELEGRAM_WEBHOOK_SECRET=${TELEGRAM_WEBHOOK_SECRET}

# Solana
ESCROW_SOLANA_ADDRESS=${ESCROW_SOLANA_ADDRESS}
ESCROW_SOLANA_PRIVATE=${ESCROW_SOLANA_PRIVATE}

# Stripe
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
STRIPE_PUBLIC_KEY=${STRIPE_PUBLIC_KEY}
STRIPE_SECRET_WEBHOOK_KEY=${STRIPE_SECRET_WEBHOOK_KEY}

# Sports & Media
SPORTS_DB_API_KEY=${SPORTS_DB_API_KEY}
PINATA_KEY=${PINATA_KEY}
PINATA_SECRET=${PINATA_SECRET}
PINATA_JWT=${PINATA_JWT}
PINATA_GATEWAY=${PINATA_GATEWAY}

# Auth
AUTH_SECRET=${AUTH_SECRET}
AUTH_DISCORD_ID=${AUTH_DISCORD_ID}
AUTH_DISCORD_SECRET=${AUTH_DISCORD_SECRET}
EOF

echo "Environment variables configured"

echo "=== DB Migration ==="
npx prisma generate

echo "=== Running Channels Migration ==="
# Export environment variables for the migration script
export DB_HOST=${MYSQL_HOST}
export DB_USER=${MYSQL_USER}
export DB_PASSWORD=${MYSQL_PASSWORD}
export DB_NAME=${MYSQL_DATABASE}
export DB_PORT=${MYSQL_PORT}
node scripts/run-channels-migration.js || echo "Migration completed or tables already exist"

echo "=== Building Project ==="
npm run build

echo "=== Restarting Application ==="
pm2 restart 4

echo "=== Final PM2 Status ==="
pm2 list 