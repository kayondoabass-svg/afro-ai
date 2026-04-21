#!/usr/bin/env bash
# Afro AI auth Worker — one-shot setup.
# Run from inside the cloudflare/ directory:
#   cd cloudflare && bash setup.sh
#
# Requires: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID environment variables.
set -euo pipefail

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set."
  exit 1
fi

echo "==> 1/5  Installing Worker dependencies..."
npm install --silent

echo "==> 2/5  Creating D1 database (skip if it already exists)..."
DB_OUTPUT=$(npx wrangler d1 create afro-ai-auth 2>&1 || true)
echo "$DB_OUTPUT"

DB_ID=$(echo "$DB_OUTPUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -n1 || true)

if [ -n "$DB_ID" ]; then
  echo "==> Found new database_id: $DB_ID"
  echo "    Update wrangler.toml with this id, then re-run this script."
  echo "    sed: change   database_id = \"REPLACE_WITH_DB_ID_AFTER_CREATING\""
  echo "         to        database_id = \"$DB_ID\""
  exit 0
fi

echo "==> 3/5  Running schema migrations on remote D1..."
npx wrangler d1 execute afro-ai-auth --remote --file=./schema.sql

echo "==> 4/5  Setting Worker secrets (you'll be prompted for each)..."
echo ""
echo "First — JWT_SECRET. We'll generate a strong one and pipe it directly to wrangler (it is never printed)."
openssl rand -base64 64 | tr -d '\n' | npx wrangler secret put JWT_SECRET

echo ""
if [ -n "${TURNSTILE_SECRET_KEY:-}" ]; then
  echo "Found TURNSTILE_SECRET_KEY in env — uploading."
  echo "$TURNSTILE_SECRET_KEY" | npx wrangler secret put TURNSTILE_SECRET_KEY
else
  echo "Now paste your Turnstile SECRET key when prompted:"
  npx wrangler secret put TURNSTILE_SECRET_KEY
fi

echo ""
# Mail bridge: Worker forwards transactional mail to Express's AWS SES
# sender via POST /api/internal/send-email, protected by a shared secret.
if [ -n "${INTERNAL_EMAIL_SECRET:-}" ]; then
  echo "Found INTERNAL_EMAIL_SECRET in env — uploading."
  echo "$INTERNAL_EMAIL_SECRET" | npx wrangler secret put INTERNAL_EMAIL_SECRET
else
  echo "Paste the INTERNAL_EMAIL_SECRET shared with Express (or hit Enter to skip):"
  read -r INTERNAL_INPUT
  if [ -n "$INTERNAL_INPUT" ]; then
    echo "$INTERNAL_INPUT" | npx wrangler secret put INTERNAL_EMAIL_SECRET
  fi
fi

if [ -n "${EXPRESS_BASE_URL:-}" ]; then
  echo "Found EXPRESS_BASE_URL in env — uploading."
  echo "$EXPRESS_BASE_URL" | npx wrangler secret put EXPRESS_BASE_URL
fi

echo "==> 5/5  Deploying Worker..."
npx wrangler deploy

echo ""
echo "✅ Done. Test it:"
echo "   curl https://afro-ai-auth.<your-subdomain>.workers.dev/health"
