---
name: Caddy empty-200 white screen = missing site block
description: Diagnosing a blank/white production page that returns HTTP 200 with content-length 0 on the shared droplet's Caddy reverse proxy.
---

# Symptom
Production page renders pure white. The origin returns **HTTP 200 with `content-length: 0` and NO `content-type` header** (seen via `curl -I` / `-w "%{size_download}"`). Cloudflare shows `cf-cache-status: DYNAMIC` (not a cache artifact). This is distinct from a Cloudflare "Host Error" (which means Caddy/origin is down, a 52x).

# Root cause
This is Caddy's default response when the request **Host matches no site block**. The shared droplet fronts multiple sites with named-host blocks in `/etc/caddy/Caddyfile`. If a hostname (e.g. the **apex** `afroaigroup.com`) has no block while a sibling (e.g. `api.afroaigroup.com`) does, the covered host works and the uncovered host returns a blank 200. The Node app is healthy the whole time — it is never even queried.

**Why:** named-address Caddyfiles have no implicit catch-all; an unmatched Host gets an empty 200, not a 404 or error.

# How to diagnose (fast)
1. `curl -sS -m20 --compressed -o /dev/null -w "status=%{http_code} size=%{size_download} type=%{content_type}\n" https://DOMAIN/` — empty `size=0` + blank type = missing-block signature.
2. Hit the Node app **directly on its port** to prove it's healthy: `curl -i http://127.0.0.1:PORT/api/health`.
3. Identify which process owns which port: `sudo ss -ltnp | grep node` then `sudo cat /proc/PID/cmdline | tr '\0' ' '`. On this droplet afro-ai = `/opt/afro-ai` on **:3000**; brightboard = `/var/www/brightboardapp.com` on **:5000**. (Both build to `dist/index.cjs` — same filename, different apps; that is NOT a port conflict.)
4. List the proxy rules: `grep -nE 'reverse_proxy|DOMAIN|:3000|:5000' /etc/caddy/Caddyfile`. A missing apex/`www` entry confirms it.

# Fix
Add a site block for the missing host(s) mirroring the working sibling, pointed at the same upstream port. For the apex/www that means `afroaigroup.com, www.afroaigroup.com { ... reverse_proxy 127.0.0.1:3000 ... }` using the same `tls /etc/ssl/cloudflare/afroaigroup.com.pem ...key` (the Cloudflare origin cert covers `afroaigroup.com` + `*.afroaigroup.com`). Append with a quoted heredoc (`sudo tee -a ... <<'EOF'`), then `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`. Reload is graceful and atomic — a bad config keeps the old one serving. Verify locally bypassing Cloudflare: `curl -k --resolve DOMAIN:443:127.0.0.1 -w "%{size_download}" https://DOMAIN/` should show a large size.

# Watch out
- Beware external "port conflict / `pkill -9 node`" advice: on this multi-site box that kills ALL sites for no benefit. Verify ports first — distinct ports (3000 vs 5000) = no conflict.
- The user's terminal mangles pasted multi-line command blocks, but **single `&&`-joined lines and quoted heredocs paste fine**. Give one line at a time.
