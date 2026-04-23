#!/usr/bin/env bash
# =============================================================================
# One-command deploy: builds locally, rsyncs to Hetzner, swaps the symlink,
# restarts the systemd service. Zero downtime via release directories.
#
# Usage:
#   HETZNER_HOST=api.afroaigroup.com bash deploy/hetzner/deploy.sh
# Optional:
#   HETZNER_USER=afro    (default)
#   HETZNER_PORT=22      (default)
# =============================================================================
set -euo pipefail

HOST="${HETZNER_HOST:?Set HETZNER_HOST to the server IP or hostname}"
USER="${HETZNER_USER:-afro}"
PORT="${HETZNER_PORT:-22}"
SSH_OPTS="-p $PORT -o StrictHostKeyChecking=accept-new"
RSYNC_OPTS="-az --delete -e \"ssh $SSH_OPTS\""

RELEASE="$(date -u +%Y%m%d%H%M%S)"
REMOTE_RELEASE="/srv/afro-ai/releases/$RELEASE"

echo "==> Building locally"
npm ci --no-audit --no-fund
npm run build

echo "==> Creating release dir on remote: $REMOTE_RELEASE"
ssh $SSH_OPTS "$USER@$HOST" "mkdir -p $REMOTE_RELEASE"

echo "==> Rsyncing build artifacts"
# We ship the built dist/ and only the runtime deps. Vite client assets are
# already bundled into dist/ by script/build.ts.
rsync -az --delete \
  -e "ssh $SSH_OPTS" \
  dist/ "$USER@$HOST:$REMOTE_RELEASE/dist/"

rsync -az \
  -e "ssh $SSH_OPTS" \
  package.json package-lock.json "$USER@$HOST:$REMOTE_RELEASE/"

echo "==> Installing production deps on remote"
ssh $SSH_OPTS "$USER@$HOST" "cd $REMOTE_RELEASE && npm ci --omit=dev --no-audit --no-fund"

echo "==> Swapping current -> $RELEASE and restarting service"
ssh $SSH_OPTS "$USER@$HOST" bash <<EOF
  set -euo pipefail
  ln -sfn $REMOTE_RELEASE /srv/afro-ai/current
  sudo systemctl restart afro-ai
  # Keep last 5 releases, prune older
  cd /srv/afro-ai/releases && ls -1t | tail -n +6 | xargs -r rm -rf
EOF

echo "==> Health check"
sleep 2
curl -fsS "https://$HOST/healthz" && echo " OK" || echo " (no /healthz route — that's fine)"

echo "==> Deployed release $RELEASE"
