#!/usr/bin/env bash
# Explicit administrator setup/update; never run by app startup or public APIs.
set -euo pipefail
[[ "$(id -u)" == 0 ]] || { echo "Run this installer as the VPS administrator."; exit 1; }
BUNDLE="${1:?Pass the path to the built standalone media-retention bundle}"
NODE_BIN="$(command -v node)"
"$NODE_BIN" --check "$BUNDLE"
test -d /opt/afro-ai/node_modules/pg
test -f /srv/afro-ai/shared/.env
case "$(systemctl show afro-ai -p EnvironmentFiles --value)" in
  *"/srv/afro-ai/shared/.env"*) ;;
  *) echo "App environment file mismatch; refusing installation."; exit 1 ;;
esac
APP_USER="$(systemctl show afro-ai -p User --value)"
APP_USER="${APP_USER:-root}"
[[ "$APP_USER" =~ ^[a-z_][a-z0-9_-]*$ ]]
for unit in afro-ai-media-retention.service afro-ai-media-retention.timer; do
  if [[ -f "/etc/systemd/system/$unit" ]] &&
     ! grep -q 'Managed Afro AI media retention' "/etc/systemd/system/$unit"; then
    echo "Refusing to replace an unmanaged retention unit."; exit 1
  fi
done
install -d -m 0755 /opt/afro-ai-maintenance
install -m 0644 "$BUNDLE" /opt/afro-ai-maintenance/media-retention.cjs
cat > /etc/systemd/system/afro-ai-media-retention.service <<UNIT
# Managed Afro AI media retention
[Unit]
Description=Remove generated media after 72 hours
After=network-online.target
[Service]
Type=oneshot
User=$APP_USER
EnvironmentFile=/srv/afro-ai/shared/.env
Environment=NODE_PATH=/opt/afro-ai/node_modules
ExecStart=$NODE_BIN /opt/afro-ai-maintenance/media-retention.cjs
TimeoutStartSec=180
NoNewPrivileges=true
UNIT
cat > /etc/systemd/system/afro-ai-media-retention.timer <<'UNIT'
# Managed Afro AI media retention
[Unit]
Description=Check generated-media expiry every minute
[Timer]
OnCalendar=*-*-* *:*:00
AccuracySec=1s
Persistent=true
Unit=afro-ai-media-retention.service
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl start afro-ai-media-retention.service
systemctl enable --now afro-ai-media-retention.timer
echo "Media cleanup verified and scheduled; the main application was not restarted."
