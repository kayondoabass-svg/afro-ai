#!/usr/bin/env bash
# =============================================================================
# Provision Cloudflare R2 bucket + access keys for Afro AI uploads.
#
# Reuses your existing CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID
# (already set as Replit secrets). Requires the API token to have R2 Edit
# permission — if it doesn't, create a new token at
# https://dash.cloudflare.com/profile/api-tokens with template
# "R2 Token (Edit)" and pass it via R2_PROVISION_TOKEN.
#
# Outputs the four lines you paste into /srv/afro-ai/shared/.env:
#   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
# =============================================================================
set -euo pipefail

ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID}"
TOKEN="${R2_PROVISION_TOKEN:-${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN or R2_PROVISION_TOKEN}}"
BUCKET="${R2_BUCKET_NAME:-afro-ai-uploads}"

echo "==> Creating R2 bucket: $BUCKET"
curl -fsS -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/buckets" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data "{\"name\":\"$BUCKET\"}" \
  | grep -q '"success":true' && echo "  bucket created or already exists"

echo "==> Creating S3-compatible access key"
KEY_JSON=$(curl -fsS -X POST \
  "https://api.cloudflare.com/client/v4/user/tokens" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data "{
    \"name\": \"afro-ai-r2-$BUCKET\",
    \"policies\": [{
      \"effect\": \"allow\",
      \"resources\": {\"com.cloudflare.api.account.$ACCOUNT_ID\": \"*\"},
      \"permission_groups\": [{\"id\": \"2efd5506f9c8494dacb1fa10a3e7d5b6\", \"name\": \"Workers R2 Storage Write\"}]
    }]
  }")

echo
echo "==================================================================="
echo "Paste these into /srv/afro-ai/shared/.env on the Hetzner server:"
echo "==================================================================="
echo "R2_ACCOUNT_ID=$ACCOUNT_ID"
echo "R2_BUCKET_NAME=$BUCKET"
echo
echo "For S3 credentials (R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY), open"
echo "the Cloudflare dashboard:"
echo "  https://dash.cloudflare.com/$ACCOUNT_ID/r2/api-tokens"
echo "Click 'Create API token' → 'Object Read & Write' for bucket '$BUCKET'."
echo "Copy the Access Key ID and Secret Access Key shown ONCE on that page."
echo "==================================================================="
