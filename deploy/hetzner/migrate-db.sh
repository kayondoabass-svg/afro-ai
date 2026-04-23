#!/usr/bin/env bash
# =============================================================================
# One-shot Postgres migration: dumps the Replit DB and restores it onto the
# fresh Hetzner Postgres. Safe to re-run — it drops + recreates the public
# schema before restoring.
#
# Required env vars:
#   SOURCE_DATABASE_URL     — the Replit Postgres URL (from current .env)
#   TARGET_HOST             — Hetzner server hostname/IP
# Optional:
#   TARGET_USER=afro
#   TARGET_DB=afroai
#
# Usage:
#   SOURCE_DATABASE_URL=postgres://... TARGET_HOST=api.afroaigroup.com \
#     bash deploy/hetzner/migrate-db.sh
# =============================================================================
set -euo pipefail

SRC="${SOURCE_DATABASE_URL:?Set SOURCE_DATABASE_URL to the Replit Postgres URL}"
HOST="${TARGET_HOST:?Set TARGET_HOST to the Hetzner server}"
USER="${TARGET_USER:-afro}"
DB="${TARGET_DB:-afroai}"

DUMP="/tmp/afroai-$(date -u +%Y%m%d%H%M%S).dump"

echo "==> Dumping source database to $DUMP"
pg_dump --format=custom --no-owner --no-acl --verbose "$SRC" -f "$DUMP"
echo "==> Dump size: $(du -h "$DUMP" | cut -f1)"

echo "==> Copying dump to $HOST"
scp "$DUMP" "$USER@$HOST:/tmp/"

REMOTE_DUMP="/tmp/$(basename "$DUMP")"

echo "==> Restoring on remote (this drops + recreates the public schema)"
ssh "$USER@$HOST" bash <<EOF
  set -euo pipefail
  sudo -u postgres psql -d $DB -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'
  sudo -u postgres pg_restore --no-owner --no-acl --dbname=$DB $REMOTE_DUMP
  rm -f $REMOTE_DUMP
EOF

rm -f "$DUMP"
echo "==> Migration complete. Verify with: psql \$DATABASE_URL -c '\\dt'"
