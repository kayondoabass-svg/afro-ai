---
name: Caddy shared-log-dir permission outage
description: Whole-site "Host Error" with a healthy Node app = Caddy (the shared reverse proxy) can't write its access.log; how to spot it and why it isn't OOM.
---

# Caddy shared-log-dir permission outage (prod droplet)

On the Afro AI prod droplet, **all sites sit behind ONE Caddy reverse proxy**. If Caddy
won't start, Cloudflare shows **"Host Error" / "Web server is down"** for *every* site —
even though the Node app (`afro-ai.service`) is running fine and reachable on its own port.
The symptom looks like a total outage or an OOM, but the proxy is the single point of failure.

## The specific trap
Caddy (runs as user **`caddy`**) is configured to write its access log to
`/srv/afro-ai/logs/access.log`. That **same directory** is also used by `afro-ai.service`
(runs as user **`afro`**) for `app.log` / `app.err.log` (systemd `StandardOutput/StandardError=append:`).
Two different service users share one log directory.

If that directory or `access.log` gets chowned to `afro` (e.g. a stray
`chown -R afro:afro /srv/afro-ai` in a setup/deploy step) **or** `access.log` becomes mode
`0600`, the `caddy` user can no longer open it → Caddy exits at startup with
`code=exited, status=1/FAILURE` and the error
`opening log writer ... /srv/afro-ai/logs/access.log: permission denied`.
A reboot does NOT fix it — Caddy just re-hits the wall on boot.

## Diagnosis shortcuts
- `systemctl status caddy` shows the `permission denied` log-writer error — that's the whole story.
- `status=1/FAILURE` (`code=exited`) = the process chose to exit / config error. This is **NOT** an
  OOM kill. An OOM kill shows `code=killed` / SIGKILL **and** a `dmesg` line like "Killed process …".
  Empty `dmesg | grep -i "killed process"` + a service `status=1` rules OOM out.
- Don't be misled by RAM pressure: this droplet idles at well under half its memory and the Node
  apps are ~100 MB each. A "site down" here is far more likely the proxy than memory.

## Restore-service fix
Give the `caddy` user back its own log, keep the app logs owned by `afro`:
```
sudo chown caddy:caddy /srv/afro-ai/logs /srv/afro-ai/logs/access.log
sudo chmod 755 /srv/afro-ai/logs
sudo chmod 644 /srv/afro-ai/logs/access.log
sudo systemctl restart caddy
```
(App logs `app.log`/`app.err.log` must stay `afro:afro` so afro-ai keeps logging.)

## Permanent fix (recommended)
Point Caddy's access log at its **own dedicated dir** (e.g. `/var/log/caddy/`, caddy-owned) so the
`caddy` and `afro` users never share a directory. Then a `chown -R afro` on `/srv/afro-ai` can't
take the proxy down again. Also add **logrotate** for the app logs — `app.log` was seen at 211 MB
with no rotation (slow disk-fill risk, unrelated to this outage).

**Why:** a single shared log dir + two service users is the latent fault; any ownership-changing
op anywhere under `/srv/afro-ai` silently bricks the proxy for all sites at the next (re)start.
