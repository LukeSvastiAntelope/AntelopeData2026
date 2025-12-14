#!/bin/bash
set -e

# echo "=== Starting Deployment ==="
echo "=== Deployment Info ==="
echo "Commit SHA: $(git rev-parse HEAD)"
echo "Commit short: $(git rev-parse --short HEAD)"
echo "Commit message: $(git log -1 --pretty=format:'%s')"
echo "Commit date: $(git log -1 --pretty=format:'%ci')"
echo "Branch: $(git rev-parse --abbrev-ref HEAD)"
echo ""
echo "=== Working Directory ==="
pwd
echo ""

# If this script is invoked as root (e.g., via GitHub Actions SSH),
# re-exec as appuser while preserving env vars.
if [ "$(id -u)" = "0" ] && id -u appuser >/dev/null 2>&1 && [ -z "${DEPLOY_AS_APPUSER:-}" ]; then
  export DEPLOY_AS_APPUSER=1
  exec sudo -E -u appuser -H bash -lc "cd \"$(pwd)\" && DEPLOY_AS_APPUSER=1 ./deploy.sh"
fi

echo "=== Checking Node Version ==="
node -v

echo "=== Installing Dependencies ==="
# next build requires tooling like tailwindcss/postcss which are in devDependencies.
# Ensure devDependencies are installed even when NODE_ENV=production.
export NPM_CONFIG_PRODUCTION=false
npm install --include=dev

echo "=== Using runtime environment variables from GitHub Actions ==="

echo "=== Writing .env.production from runtime env (no secrets echoed) ==="
node <<'NODE'
const fs = require('fs');

// Only write keys that the app expects at runtime/build time.
// Values are pulled from process.env (GitHub Actions -> ssh-action envs).
// NODE_ENV: default to production if not provided by deploy runner
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';

const REQUIRED = [
  'NEXT_PUBLIC_APP_URL',
  'PUBLIC_BASE_URL',
  'AUTH_SECRET',
  'MYSQL_HOST',
  'MYSQL_PORT',
  'MYSQL_USER',
  'MYSQL_PASSWORD',
  'MYSQL_DATABASE',
  'OPENAI_API_KEY',
];

const OPTIONAL = [
  'ENVIRONMENT_MODE',
  'HOUSE_FEE_RATE',
  'CREDIT_BALANCE',
  'JWT_SECRET',
  'JWT_SECRET_KEY',
  'DEEPSEEK_API_KEY',
  'GEMINI_API_KEY',
  'ANTHROPIC_API_KEY',
  'SERPAPI_API_KEY',
  'PINECONE_API_KEY',
  'COINMARKETCAP_API_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_BOT_USERNAME',
  'TELEGRAM_CHANNEL_ID',
  'ESCROW_SOLANA_ADDRESS',
  'ESCROW_SOLANA_PRIVATE',
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLIC_KEY',
  'STRIPE_SECRET_WEBHOOK_KEY',
  'SPORTS_DB_API_KEY',
  'PINATA_KEY',
  'PINATA_SECRET',
  'PINATA_JWT',
  'PINATA_GATEWAY',
  'SECURE_STORAGE_KEY',
  'TELEGRAM_WEBHOOK_SECRET',
  'ADMIN_TASK_TOKEN',
];

function esc(v) {
  return String(v)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');
}

const missing = [];
for (const k of REQUIRED) {
  const v = process.env[k];
  if (!v) missing.push(k);
}
if (missing.length) {
  console.error('[deploy] Missing required env vars:', missing.join(', '));
  process.exit(2);
}

const keys = [...REQUIRED, ...OPTIONAL];
const lines = [];
for (const k of keys) {
  const v = process.env[k];
  if (v === undefined || v === null || v === '') continue;
  lines.push(`${k}="${esc(v)}"`);
}

fs.writeFileSync('.env.production', lines.join('\n') + '\n', { mode: 0o600 });
console.log('[deploy] Wrote .env.production with', lines.length, 'keys');
NODE

echo "=== DB Migration ==="
npx prisma generate 2>/dev/null || echo "Prisma not configured, skipping..."

echo "=== Running Channels Migration ==="
# Export environment variables for the migration script
export DB_HOST=${MYSQL_HOST}
export DB_USER=${MYSQL_USER}
export DB_PASSWORD=${MYSQL_PASSWORD}
export DB_NAME=${MYSQL_DATABASE}
export DB_PORT=${MYSQL_PORT}
node scripts/run-channels-migration.js || echo "Migration completed or tables already exist"

echo "=== Building Project ==="
NODE_OPTIONS="--max-old-space-size=4096" npm run build

echo "=== Restarting Application with updated env ==="
if ! pm2 describe getantelope >/dev/null 2>&1; then
  echo "PM2 process 'getantelope' not found; starting it..."
  PORT=${PORT:-3000} NODE_ENV=${NODE_ENV:-production} pm2 start npm --name getantelope -- start
  pm2 save || true
else
  pm2 restart getantelope --update-env || true
fi

echo "=== Final PM2 Status ==="
pm2 list