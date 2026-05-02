#!/usr/bin/env bash
#
# Manually roll the production site back to a previous commit.
#
# Usage on the droplet (as root):
#   bash /opt/afro-ai/scripts/rollback.sh           # roll back one commit
#   bash /opt/afro-ai/scripts/rollback.sh <sha>     # roll back to a specific commit
#
# Pick a SHA from:
#   git -C /opt/afro-ai log --oneline -10
#
# Same safety net as deploy.sh: snapshots dist before building. If the
# rollback build itself fails, the snapshot is restored and the service
# stays on whatever was running before you ran this command.

set -uo pipefail

APP_DIR="/opt/afro-ai"
SHARED_ENV="/srv/afro-ai/shared/.env"
SERVICE="afro-ai"
LOG_FILE="/var/log/afro-ai-deploy.log"
LOCK_FILE="/var/lock/afro-ai-deploy.lock"
SERVICE_USER="afro"
PORT="${PORT:-5000}"
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"
BUILD_TIMEOUT="${BUILD_TIMEOUT:-600}"

log() {
  printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*" | tee -a "$LOG_FILE"
}

die() { log "FATAL: $*"; exit 1; }

main() {
  mkdir -p "$(dirname "$LOG_FILE")" "$(dirname "$LOCK_FILE")"
  touch "$LOG_FILE"

  exec {lock_fd}>"$LOCK_FILE"
  flock -n "$lock_fd" || die "deploy/rollback already in progress"

  for cmd in git npm curl systemctl flock; do
    command -v "$cmd" >/dev/null 2>&1 || die "missing command: $cmd"
  done

  cd "$APP_DIR" || die "cannot cd into $APP_DIR"

  local dirty
  dirty=$(git -C "$APP_DIR" status --porcelain)
  [ -z "$dirty" ] || die "working tree is dirty — commit/stash first"

  local current_sha
  current_sha=$(git -C "$APP_DIR" rev-parse HEAD)

  local target_sha="${1:-}"
  if [ -z "$target_sha" ]; then
    target_sha=$(git -C "$APP_DIR" rev-parse HEAD~1)
    log "No SHA given — rolling back one commit to $target_sha"
  fi

  git -C "$APP_DIR" rev-parse --verify "${target_sha}^{commit}" >/dev/null 2>&1 \
    || die "$target_sha is not a valid commit"

  log "==== ROLLBACK START ===="
  log "Current: $current_sha"
  log "Target:  $target_sha"

  rm -rf "$APP_DIR/dist.prev"
  if [ -d "$APP_DIR/dist" ]; then
    cp -al "$APP_DIR/dist" "$APP_DIR/dist.prev" 2>/dev/null \
      || cp -a "$APP_DIR/dist" "$APP_DIR/dist.prev"
  fi

  git -C "$APP_DIR" reset --hard "$target_sha" >> "$LOG_FILE" 2>&1 \
    || die "git reset failed"

  log "Building $target_sha..."
  (
    set -a
    # shellcheck disable=SC1090
    source "$SHARED_ENV"
    set +a
    cd "$APP_DIR" || exit 1
    timeout "$BUILD_TIMEOUT" bash -c 'NODE_OPTIONS="--max-old-space-size=768" npm run build'
  )
  if [ $? -ne 0 ]; then
    log "Build of $target_sha FAILED — restoring previous state"
    git -C "$APP_DIR" reset --hard "$current_sha" >> "$LOG_FILE" 2>&1 || true
    if [ -d "$APP_DIR/dist.prev" ]; then
      rm -rf "$APP_DIR/dist"
      mv "$APP_DIR/dist.prev" "$APP_DIR/dist"
      chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/dist"
      systemctl restart "$SERVICE"
    fi
    die "rollback aborted — site is still on $current_sha"
  fi

  chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/dist"
  systemctl restart "$SERVICE"
  sleep 3

  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$HEALTH_URL" 2>/dev/null || echo "000")
  if [ "$code" != "200" ] && [ "$code" != "204" ]; then
    log "Health check FAILED ($code) after rollback — restoring previous state"
    git -C "$APP_DIR" reset --hard "$current_sha" >> "$LOG_FILE" 2>&1 || true
    if [ -d "$APP_DIR/dist.prev" ]; then
      rm -rf "$APP_DIR/dist"
      mv "$APP_DIR/dist.prev" "$APP_DIR/dist"
      chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/dist"
      systemctl restart "$SERVICE"
    fi
    die "rollback failed health check — site reverted to $current_sha"
  fi

  rm -rf "$APP_DIR/dist.prev"

  if [ -n "${CLOUDFLARE_ZONE_ID:-}" ] && [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
    log "Purging Cloudflare cache..."
    curl -s --max-time 15 -X POST \
      "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data '{"purge_everything":true}' >> "$LOG_FILE" 2>&1
    echo >> "$LOG_FILE"
  fi

  log "==== ROLLBACK COMPLETE — now on $target_sha ===="
}

main "$@"
