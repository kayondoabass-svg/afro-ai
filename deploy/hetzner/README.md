# Afro AI → Hetzner migration kit

Everything you need to move Afro AI's Express API + Postgres off Replit
and onto your own Hetzner Cloud server. Cloudflare Workers (auth) and
Cloudflare R2 (object storage) stay where they are — only the Node app
and database move.

## What you get out of this
- Costs drop from Replit's per-app pricing to **~€5/month** for a Hetzner
  CX22 (2 vCPU, 4 GB RAM, 40 GB disk) — easily handles thousands of users.
- No more cold starts or sleep-on-idle.
- Full root, persistent disk, real Postgres, full logs.
- Replit becomes optional — you can keep using it as a dev environment.

## Prerequisites (you do these once)
1. **Hetzner Cloud account** — sign up at https://www.hetzner.com/cloud
   (5-min email + card verification).
2. **An SSH key** on your laptop (`ls ~/.ssh/id_ed25519.pub`; if missing:
   `ssh-keygen -t ed25519`).
3. **Domain DNS** in Cloudflare (already set up — `afroaigroup.com`).

## Step-by-step

### 1. Provision the server (~3 min)
- Hetzner Cloud → **Add Server**
- Location: Helsinki (cheapest + close to Africa via undersea cables)
- Image: **Ubuntu 24.04**
- Type: **CX22** (€4.90/mo) to start
- Networking: enable IPv4 + IPv6
- SSH Keys: paste your `~/.ssh/id_ed25519.pub`
- **Cloud config**: paste `deploy/hetzner/cloud-init.yaml` after replacing
  the `AAAA_REPLACE_ME...` line with your actual public key
- Click Create. Wait ~2 min for cloud-init to finish.

### 2. First SSH + grab the DB password
```bash
ssh afro@<server-ip>
sudo cat /root/db_password.txt    # copy this line — you'll paste it next
sudo rm /root/db_password.txt     # delete after copying
```

### 3. Drop in production env vars
```bash
# Still on the Hetzner server:
sudo mkdir -p /srv/afro-ai/shared
sudo nano /srv/afro-ai/shared/.env      # paste the .env.example contents,
                                         # fill in DATABASE_URL, JWT_SECRET, etc.
sudo chown afro:afro /srv/afro-ai/shared/.env
sudo chmod 600 /srv/afro-ai/shared/.env
```
Use `deploy/hetzner/.env.example` as the template. The **JWT_SECRET must
match** the Cloudflare worker's `JWT_SECRET` exactly so cookies issued by
the worker validate on Express.

### 4. Provision Cloudflare R2 (object storage)
From your laptop:
```bash
bash deploy/hetzner/setup-r2.sh
```
Follow the printed link to grab the S3 access key + secret, then add the
four `R2_*` lines to `/srv/afro-ai/shared/.env`.

### 5. Install Caddy reverse proxy + systemd unit
On the Hetzner server:
```bash
sudo cp deploy/hetzner/Caddyfile /etc/caddy/Caddyfile
sudo cp deploy/hetzner/afro-ai.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl reload caddy
sudo systemctl enable afro-ai     # don't start yet — no code deployed
```
(`deploy/hetzner/*` will be available there after your first `deploy.sh`
run, or you can `scp` them up beforehand.)

### 6. Point DNS at the new server
In Cloudflare → DNS for `afroaigroup.com`:
- Add `A` record: **api** → `<your-hetzner-ip>` (proxy: ON, orange cloud)

Wait 30 seconds for propagation. Caddy will auto-fetch a Let's Encrypt
cert as soon as it sees a request.

### 7. Migrate the database
From your laptop:
```bash
SOURCE_DATABASE_URL="<your-current-replit-DATABASE_URL>" \
TARGET_HOST=<your-hetzner-ip> \
  bash deploy/hetzner/migrate-db.sh
```

### 8. First deploy
From your laptop, in the project root:
```bash
HETZNER_HOST=<your-hetzner-ip> bash deploy/hetzner/deploy.sh
```
This builds locally, rsyncs `dist/` + production deps to the server,
flips the `current` symlink, and restarts the service. Releases are kept
in `/srv/afro-ai/releases/` (last 5) so you can roll back instantly with
`ln -sfn /srv/afro-ai/releases/<old> /srv/afro-ai/current && systemctl
restart afro-ai`.

### 9. Verify + cut over
```bash
curl -i https://api.afroaigroup.com/api/health    # adjust to a real route
ssh afro@<host> "sudo journalctl -u afro-ai -n 100 --no-pager"
```
Once green, update the React app's `API_BASE` (currently empty / same-
origin) to point at `https://api.afroaigroup.com`, redeploy the
frontend, and you're done.

## Operations cheat sheet
| What | Command |
|---|---|
| Live logs | `ssh afro@<host> "journalctl -u afro-ai -f"` |
| Restart | `ssh afro@<host> "sudo systemctl restart afro-ai"` |
| Roll back | `ssh afro@<host> "ln -sfn /srv/afro-ai/releases/<TS> /srv/afro-ai/current && sudo systemctl restart afro-ai"` |
| DB shell | `ssh afro@<host> "sudo -u postgres psql afroai"` |
| Disk usage | `ssh afro@<host> "df -h /"` |
| Update Caddy | edit `/etc/caddy/Caddyfile` then `sudo systemctl reload caddy` |

## What stays on Cloudflare
- Auth worker (`afroaigroup.com/cf-auth/*`)
- Auth database (D1)
- Object storage (R2)
- DNS + DDoS protection
- Turnstile

## What stays on Replit (optional, dev only)
- Dev environment for editing code with Replit Agent
- Preview workflows
- You can keep Replit Postgres as a dev DB; production points at Hetzner.
