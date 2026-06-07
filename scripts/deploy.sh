#!/usr/bin/env bash
#
# Afro AI production deploy script.
#
# Run on the DigitalOcean droplet (root@165.232.64.81) as root:
#   bash /opt/afro-ai/scripts/deploy.sh
#
# Safety guarantees:
#   - flock prevents two deploys running at once.
#   - Refuses to deploy if the working tree has uncommitted changes
#     (so we never silently throw away a hotfix).
#   - Snapshots the running dist/ as dist.prev BEFORE building. If the
#     build fails OR the health check fails, the snapshot is restored
#     and the service is restarted on the OLD dist. The site stays up
#     even if the rollback rebuild itself fails.
#   - Logs every run to /var/log/afro-ai-deploy.log with UTC timestamps.

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

die() {
  log "FATAL: $*"
  exit 1
}

require_clean_tree() {
  local dirty
  dirty=$(git -C "$APP_DIR" status --porcelain)
  if [ -n "$dirty" ]; then
    log "Working tree is DIRTY — refusing to deploy:"
    log "$dirty"
    log "Commit, stash, or discard local changes first."
    exit 1
  fi
}

check_prereqs() {
  for cmd in git npm curl systemctl flock; do
    command -v "$cmd" >/dev/null 2>&1 || die "missing required command: $cmd"
  done
  [ -d "$APP_DIR/.git" ] || die "$APP_DIR is not a git repo"
  [ -f "$SHARED_ENV" ]    || die "shared env file not found: $SHARED_ENV"
}

snapshot_dist() {
  rm -rf "$APP_DIR/dist.prev"
  if [ -d "$APP_DIR/dist" ]; then
    log "Snapshotting current dist → dist.prev"
    # cp -al is hardlinks: instant, no extra disk used unless dist changes
    cp -al "$APP_DIR/dist" "$APP_DIR/dist.prev" 2>/dev/null \
      || cp -a "$APP_DIR/dist" "$APP_DIR/dist.prev"
  else
    log "No existing dist/ — first deploy on this checkout"
  fi
}

restore_snapshot() {
  if [ ! -d "$APP_DIR/dist.prev" ]; then
    log "No dist.prev snapshot to restore — leaving dist/ as-is"
    return 1
  fi
  log "Restoring dist.prev → dist"
  rm -rf "$APP_DIR/dist.broken"
  if [ -d "$APP_DIR/dist" ]; then
    mv "$APP_DIR/dist" "$APP_DIR/dist.broken"
  fi
  mv "$APP_DIR/dist.prev" "$APP_DIR/dist"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/dist"
  return 0
}

install_deps_if_changed() {
  # Detect whether package.json / package-lock.json changed in this pull.
  # If they did, run `npm ci` so newly-added deps (which esbuild marks as
  # external and expects in node_modules at runtime) are actually present.
  # Otherwise the server crashes at startup with "Cannot find module 'X'".
  local prev="$1"
  local new="$2"
  local changed=""
  if [ -n "$prev" ] && [ -n "$new" ] && [ "$prev" != "$new" ]; then
    changed=$(git -C "$APP_DIR" diff --name-only "$prev" "$new" -- package.json package-lock.json 2>/dev/null)
  fi
  # Also install if node_modules is missing entirely (fresh checkout).
  if [ -n "$changed" ] || [ ! -d "$APP_DIR/node_modules" ]; then
    log "Dependency manifest changed (or node_modules missing) — running npm ci"
    (
      cd "$APP_DIR" || exit 1
      timeout "$BUILD_TIMEOUT" npm ci --include=dev
    )
    local rc=$?
    if [ $rc -ne 0 ]; then
      log "npm ci failed (exit $rc)"
      return $rc
    fi
    chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/node_modules" 2>/dev/null || true
  else
    log "No package.json/package-lock.json changes — skipping npm ci"
  fi
  return 0
}

run_build() {
  log "Building (timeout ${BUILD_TIMEOUT}s)..."
  (
    cd "$APP_DIR" || exit 1
    timeout "$BUILD_TIMEOUT" bash -c 'NODE_OPTIONS="--max-old-space-size=2048" npm run build'
  )
  local rc=$?
  if [ $rc -ne 0 ]; then
    log "Build failed (exit $rc)"
    return $rc
  fi
  chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/dist"
  return 0
}

post_start_stability_check() {
  # The /api/health route can answer 200 before the process has finished
  # loading every module. If the bundle throws AFTER first request (e.g.
  # a missing optional dep loaded on demand), the deploy script would
  # report SUCCESS and walk away while systemd auto-restart-loops in the
  # background. To catch that pattern, we re-check health after a short
  # delay and verify the systemd unit is still "active (running)".
  log "Post-start stability check (30s settle)..."
  sleep 30
  local state
  state=$(systemctl is-active "$SERVICE" 2>/dev/null || echo "unknown")
  if [ "$state" != "active" ]; then
    log "Service state is '$state' 30s after start — NOT stable"
    return 1
  fi
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$HEALTH_URL" 2>/dev/null || echo "000")
  if [ "$code" != "200" ] && [ "$code" != "204" ]; then
    log "Second health check 30s after start returned $code — NOT stable"
    return 1
  fi
  log "Service is stable 30s after start (state=$state, health=$code)"
  return 0
}

restart_service() {
  log "Restarting $SERVICE..."
  systemctl restart "$SERVICE" || return 1
  sleep 3
}

health_check() {
  local attempts=5
  local i=1
  while [ $i -le $attempts ]; do
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$HEALTH_URL" 2>/dev/null || echo "000")
    if [ "$code" = "200" ] || [ "$code" = "204" ]; then
      log "Health check OK on attempt $i ($code)"
      return 0
    fi
    log "Health check attempt $i/$attempts: HTTP $code"
    sleep 2
    i=$((i + 1))
  done
  return 1
}

purge_cdn() {
  if [ -z "${CLOUDFLARE_ZONE_ID:-}" ] || [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
    log "Cloudflare credentials missing — skipping cache purge"
    return 0
  fi
  log "Purging Cloudflare cache..."
  local result
  result=$(curl -s --max-time 15 -X POST \
    "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data '{"purge_everything":true}' 2>/dev/null)
  if echo "$result" | grep -q '"success":true'; then
    log "Cloudflare cache purged"
  else
    log "WARN: Cloudflare purge did not return success — users may see stale content"
    log "Response: $result"
  fi
}

emergency_recovery() {
  local previous_sha="$1"
  log "==== EMERGENCY RECOVERY — site must stay up ===="
  if restore_snapshot; then
    log "Restoring git to previous SHA $previous_sha"
    git -C "$APP_DIR" reset --hard "$previous_sha" >> "$LOG_FILE" 2>&1 || \
      log "WARN: git reset failed, but dist.prev is restored"
    if restart_service && health_check; then
      log "Recovery succeeded — running on snapshot of $previous_sha"
      return 0
    fi
    log "CRITICAL: service unhealthy even after restoring snapshot"
    return 1
  fi
  log "CRITICAL: no snapshot available, cannot recover automatically"
  return 1
}

main() {
  mkdir -p "$(dirname "$LOG_FILE")" "$(dirname "$LOCK_FILE")"
  touch "$LOG_FILE"

  exec {lock_fd}>"$LOCK_FILE"
  if ! flock -n "$lock_fd"; then
    log "Another deploy is in progress — refusing to start a second one"
    exit 1
  fi

  check_prereqs
  cd "$APP_DIR" || die "cannot cd into $APP_DIR"

  # Load shared env ONCE for the whole script (build, health, purge_cdn).
  # Sourcing inside run_build's subshell used to drop CLOUDFLARE_* before
  # purge_cdn could see them, causing intermittent "credentials missing"
  # skips. Loading here makes every later step see the same env.
  set -a
  # shellcheck disable=SC1090
  source "$SHARED_ENV"
  set +a

  # The app's real PORT lives in the shared env (e.g. 3000). HEALTH_URL was
  # computed at the top of the script from the 5000 default BEFORE this load,
  # so recompute it now. On this droplet 5000 is a DIFFERENT app, so checking
  # the wrong port returns a false-positive 200 and masks a crash-looping
  # afro-ai.service. Always target the port the service actually binds.
  PORT="${PORT:-5000}"
  HEALTH_URL="http://127.0.0.1:${PORT}/api/health"
  log "Health check target: $HEALTH_URL"

  log "==== DEPLOY START ===="
  require_clean_tree

  local previous_sha
  previous_sha=$(git -C "$APP_DIR" rev-parse HEAD)
  log "Previous SHA: $previous_sha"

  log "Pulling latest from origin/main..."
  git -C "$APP_DIR" pull --ff-only origin main >> "$LOG_FILE" 2>&1 || \
    die "git pull failed (not fast-forward?). Check the log."

  local new_sha
  new_sha=$(git -C "$APP_DIR" rev-parse HEAD)
  log "New SHA: $new_sha"

  # If dist/ already reflects the current HEAD, nothing to do.
  # Otherwise (no dist, or dist built from an older SHA — e.g. user ran
  # `git pull` manually before invoking this script) we MUST rebuild,
  # even if previous_sha == new_sha.
  local deployed_sha=""
  [ -f "$APP_DIR/dist/.deployed_sha" ] && deployed_sha=$(cat "$APP_DIR/dist/.deployed_sha" 2>/dev/null || echo "")
  if [ "$previous_sha" = "$new_sha" ] && [ "$deployed_sha" = "$new_sha" ]; then
    log "Already at latest commit AND dist/ matches. Nothing to deploy."
    log "==== DEPLOY END (no-op) ===="
    exit 0
  fi
  if [ "$previous_sha" = "$new_sha" ] && [ "$deployed_sha" != "$new_sha" ]; then
    log "Git already at $new_sha but dist/ was built from '${deployed_sha:-unknown}' — rebuilding."
  fi

  snapshot_dist

  if ! install_deps_if_changed "$previous_sha" "$new_sha"; then
    log "Dependency install FAILED — entering recovery"
    emergency_recovery "$previous_sha"
    exit 1
  fi

  if ! run_build; then
    log "Build FAILED — entering recovery"
    emergency_recovery "$previous_sha"
    exit 1
  fi

  rm -rf "$APP_DIR/dist.prev.kept"
  if [ -d "$APP_DIR/dist.prev" ]; then
    mv "$APP_DIR/dist.prev" "$APP_DIR/dist.prev.kept"
  fi

  if ! restart_service; then
    log "systemctl restart failed — entering recovery"
    mv "$APP_DIR/dist.prev.kept" "$APP_DIR/dist.prev" 2>/dev/null || true
    emergency_recovery "$previous_sha"
    exit 1
  fi

  if ! health_check; then
    log "Health check FAILED after deploy — entering recovery"
    mv "$APP_DIR/dist.prev.kept" "$APP_DIR/dist.prev" 2>/dev/null || true
    emergency_recovery "$previous_sha"
    exit 1
  fi

  if ! post_start_stability_check; then
    log "Stability check FAILED — process died after passing initial health — entering recovery"
    mv "$APP_DIR/dist.prev.kept" "$APP_DIR/dist.prev" 2>/dev/null || true
    emergency_recovery "$previous_sha"
    exit 1
  fi

  rm -rf "$APP_DIR/dist.prev.kept" "$APP_DIR/dist.broken"

  # Stamp the deployed dist/ with its SHA so future runs can detect
  # a stale build even when git is already at the latest commit.
  echo "$new_sha" > "$APP_DIR/dist/.deployed_sha"
  chown "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/dist/.deployed_sha" 2>/dev/null || true

  purge_cdn

  log "==== DEPLOY SUCCESS — now on $new_sha ===="
}

main "$@"
