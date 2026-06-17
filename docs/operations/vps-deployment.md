# VPS Deployment — auto-assigner + bots + Ollama

Deploys the always-on side of the Hirobius internal AI ops platform to a small VPS so it survives the workstation being off. Closes the gap where after-hours Discord / Telegram messages would otherwise wait for a local laptop to be on.

## Recommendation

| Provider | Plan | Specs | Price | Notes |
|----------|------|-------|-------|-------|
| **Hetzner Cloud** | CX22 | 2 vCPU, 4GB RAM, 40GB SSD | €4.51/mo | **Recommended.** Strong reliability/price ratio for 24/7 background processes. EU and US datacenters. |
| Hostinger | KVM 2 | 2 vCPU, 8GB RAM, 100GB SSD | ~$7-9/mo | One-click Ubuntu template (the option referenced in the Hermes YouTube video). Higher RAM if you want headroom for `gemma4:26b`. |
| DigitalOcean | Basic 2GB | 1 vCPU, 2GB RAM, 50GB SSD | $6/mo | Equivalent fallback. Ample reach in US. |
| Linode | Nanode 1GB | 1 vCPU, 1GB RAM, 25GB SSD | $5/mo | Tightest budget; cuts it close on RAM for Ollama. |

**For Hirobius's MVP scope (assigner + Discord/Telegram + classifier-only Ollama), Hetzner CX22 is the sweet spot.**

## What runs on the VPS

- **Ollama** with `gemma4:e4b` (~6GB RAM working set during inference; idle is small).
- **`scripts/auto-assigner.mjs`** invoked per Discord/Telegram message via `child_process.spawn`.
- **`scripts/discord-bot.mjs`** — moved off the workstation. Long-running daemon.
- **`scripts/telegram-bot.mjs`** — long-polling daemon, parallel adapter to Discord.
- **`docs/ai/routing-log.jsonl`** — append-only audit trail. Mounted on persistent volume / regular file.
- **(Optional)** `scripts/hds-bridge.mjs` — only if the Figma plugin needs to call into VPS-hosted assigner. Requires inbound HTTPS + HMAC auth.

## What does NOT run on the VPS

- **`gemma4:26b` generation** — needs 16GB+ RAM. Stays on the workstation OR routes to closed-frontier (Anthropic).
- **Closed-frontier dispatch** — those calls go to Anthropic's API; the VPS just initiates the request.
- **The `/ops` web UI** — for now, served only at `localhost` from the workstation. When deployment becomes priority, host the static build via Nginx on the VPS or push to Vercel.

## Provisioning runbook

### 1. Create the VPS (Hetzner example)

1. Sign in at console.hetzner.cloud → Add Project → Add Server.
2. Region: closest to you (Helsinki, Falkenstein, Nuremberg, Ashburn, Hillsboro).
3. Image: **Ubuntu 24.04 LTS**.
4. Type: **CX22** (2 vCPU, 4GB RAM).
5. SSH keys: upload the public half of your local ed25519 key.
6. Networking: keep default IPv4 + IPv6; UFW will lock things down post-install.
7. Order — within ~30s it has an IP.

### 2. Initial hardening

```bash
# Local — copy your SSH key for passwordless login
ssh root@<vps-ip>

# On the VPS
adduser hirobius
usermod -aG sudo hirobius
mkdir -p /home/hirobius/.ssh
cp ~/.ssh/authorized_keys /home/hirobius/.ssh/
chown -R hirobius:hirobius /home/hirobius/.ssh
chmod 700 /home/hirobius/.ssh
chmod 600 /home/hirobius/.ssh/authorized_keys

# Disable root + password login
sed -i 's/#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

# Firewall
apt update && apt upgrade -y
apt install -y ufw
ufw allow OpenSSH
ufw enable
```

### 3. Install Node + Ollama

```bash
# As hirobius user
sudo apt install -y curl git build-essential

# Node 20 via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 20 && nvm use 20

# pnpm
curl -fsSL https://get.pnpm.io/install.sh | sh -
source ~/.bashrc

# Ollama
curl -fsSL https://ollama.com/install.sh | sh
ollama pull gemma4:e4b   # ~3GB download, takes a few minutes
```

### 4. Clone repo + install deps

```bash
cd ~
git clone <your-repo-url> adrian-milsap
cd adrian-milsap
pnpm install
```

### 5. Set env vars

**HARD RULE:** Adrian sets every env var by hand on the VPS. Claude / scripts do not write `.env*` files.

```bash
# On the VPS, as the hirobius user
nano .env.local
```

Required vars for the bots:

```
DISCORD_BOT_TOKEN=...
DISCORD_OWNER_ID=...
DISCORD_GUILD_ID=...
DISCORD_DEFAULT_CLIENT=lilac-insure

TELEGRAM_BOT_TOKEN=...
TELEGRAM_OWNER_ID=...

# Optional — for Discord NL-AI fallback
ANTHROPIC_API_KEY=...

# Optional — defaults to localhost:11434
OLLAMA_HOST=http://localhost:11434
```

Permissions:
```bash
chmod 600 .env.local
```

### 6. Smoke test

```bash
echo "Set up Outlook auto-responder for Lilac" | \
  node scripts/auto-assigner.mjs --client lilac-insure
# expect: JSON output with verdict=task, tier=open-local, model=gemma4:e4b
```

### 7. systemd services

Create `/etc/systemd/system/hirobius-discord.service`:

```ini
[Unit]
Description=Hirobius Discord Bot
After=network.target

[Service]
Type=simple
User=hirobius
WorkingDirectory=/home/hirobius/adrian-milsap
ExecStart=/home/hirobius/.nvm/versions/node/v20.x.x/bin/node scripts/discord-bot.mjs
Restart=on-failure
RestartSec=5
StandardOutput=append:/var/log/hirobius/discord.log
StandardError=append:/var/log/hirobius/discord.log

[Install]
WantedBy=multi-user.target
```

Create `/etc/systemd/system/hirobius-telegram.service`:

```ini
[Unit]
Description=Hirobius Telegram Bot
After=network.target

[Service]
Type=simple
User=hirobius
WorkingDirectory=/home/hirobius/adrian-milsap
ExecStart=/home/hirobius/.nvm/versions/node/v20.x.x/bin/node scripts/telegram-bot.mjs
Restart=on-failure
RestartSec=5
StandardOutput=append:/var/log/hirobius/telegram.log
StandardError=append:/var/log/hirobius/telegram.log

[Install]
WantedBy=multi-user.target
```

Enable + start:
```bash
sudo mkdir -p /var/log/hirobius
sudo chown hirobius:hirobius /var/log/hirobius
sudo systemctl daemon-reload
sudo systemctl enable --now hirobius-discord
sudo systemctl enable --now hirobius-telegram
sudo systemctl status hirobius-discord hirobius-telegram
```

Ollama is already a systemd service from its installer — no extra config.

### 8. Verify end-to-end

1. Send a message via Discord: should get a routing decision back within 2-3 seconds.
2. Send a message via Telegram: same.
3. SSH back in:
   ```bash
   tail docs/ai/routing-log.jsonl
   ```
4. Pull the repo locally and check `/ops` Sessions feed renders both events (after a `git pull` from the VPS — or set up a sync mechanism: rsync, S3, or a small cron-driven `git push` from the VPS so localhost can pull).

### 9. Sync routing log back to the workstation

The session feed is bundled at build time from `docs/ai/routing-log.jsonl`. On the VPS, the live log accumulates events; the workstation needs a fresh copy for `/ops` to render them. Cheapest option:

```bash
# On workstation, in repo root
rsync -av hirobius@<vps-ip>:~/adrian-milsap/docs/ai/routing-log.jsonl docs/ai/
```

Bind it to a watchexec / cron / alias as fits your workflow. Step 8 of the parent plan defers the API-served version of this until `/ops` deploys publicly — for the localhost-only MVP, rsync is fine.

## Backup strategy

- `docs/ai/routing-log.jsonl` — append-only, replicated via the rsync step above. Also: VPS-side daily snapshot to `/home/hirobius/backups/` via cron.
- `clients/<slug>/tasks.json` — these live in git. Commit + push from workstation; pull on VPS before each `git pull` upgrade.

Cron snapshot (on VPS):
```cron
0 3 * * * cp /home/hirobius/adrian-milsap/docs/ai/routing-log.jsonl /home/hirobius/backups/routing-log-$(date +\%Y\%m\%d).jsonl
0 4 * * 0 find /home/hirobius/backups -name 'routing-log-*.jsonl' -mtime +30 -delete
```

## When to scale up

- **Ollama starts swapping** (check `vmstat 1` while the bots are active): upgrade to CX32 (8GB RAM) or run `gemma4:26b` on a separate beefier box.
- **Routing latency >5s consistently**: Ollama is CPU-bound on CX22. Move to a GPU VPS (Hetzner GPU lineup, RunPod, vast.ai) or relegate Ollama to a workstation peer over Tailscale.
- **You add `/ops` public deploy**: add Nginx + Caddy/Let's Encrypt, expose 443 via UFW, gate behind HTTP basic auth or the existing `hds-bridge.mjs` HMAC pattern.
