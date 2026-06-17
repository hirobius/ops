# Incident Response Runbook

> **Purpose:** Step-by-step checklists for the four most likely security incidents.  
> **Rule:** If you are responding, work the checklist top-to-bottom. Do not skip steps.  
> **Escalation:** Any step marked `[NOTIFY: Adrian]` requires human judgment before proceeding.

---

## 1 — Leaked API Key

Applies to: `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `FIGMA_PERSONAL_ACCESS_TOKEN`, `YOUTUBE_CLIENT_SECRET`, or any third-party secret.

### Detect
- [ ] Key appears in git history, public gist, pasted message, or CI log.
- [ ] Vendor alerts on anomalous usage (e.g., Anthropic usage alert).
- [ ] Unrecognized IP or model call pattern in vendor dashboard.

### Contain
- [ ] **Revoke the key immediately** at the vendor console (do not wait for confirmation).
  - Anthropic: <https://console.anthropic.com/settings/keys>
  - OpenRouter: <https://openrouter.ai/settings/keys>
  - Gemini: <https://aistudio.google.com/app/apikey>
  - Figma: <https://www.figma.com/developers/api#access-tokens>
  - Google Cloud: <https://console.cloud.google.com/apis/credentials>
- [ ] If the key is in `.env.local` on any machine, delete the line and close the terminal session.
- [ ] If the key is in a deployed environment, remove it:
  ```bash
  vercel env rm <KEY_NAME> production    # or preview / development
  vercel env add <KEY_NAME> production   # after generating new key
  vercel --prod deploy                  # redeploy to rotate runtime
  ```
- [ ] If the key was in a Discord message or webhook, delete the message and rotate `DISCORD_WEBHOOK_URL`.

### Rotate / Patch
- [ ] Generate a new key at the vendor console.
- [ ] Update `.env.local` on all developer machines.
- [ ] Update CI secrets (GitHub Settings → Secrets and variables → Actions).
- [ ] Update Vercel environment variables (see commands above).
- [ ] If the leaked key was in git history, scrub it:
  ```bash
  # Install if needed: pnpm add -D @bfg-repo-cleaner/bfg
  bfg --delete-files .env.local
  git reflog expire --expire=now --all && git gc --prune=now --aggressive
  ```
  > **Note:** Force-pushing rewritten history breaks open PRs. `[NOTIFY: Adrian]` before force-push.

### Assess Blast Radius
- [ ] Check vendor dashboard for usage during the exposure window (note start/end times).
- [ ] Export logs if available (Anthropic: request via support).
- [ ] Check for any downstream actions the key could perform (model calls, file reads, deployment triggers).
- [ ] Document findings in `docs/security/audit-log.md` with exact UTC timestamps.

### Notify
- [ ] `[NOTIFY: Adrian]` — decide whether client notification or vendor breach report is required.
- [ ] If the key touched client data, follow **Scenario 3 — Client Data Exposure** notification steps.

---

## 2 — Compromised Discord Bot Token

Applies to: `DISCORD_BOT_TOKEN` or the bot account itself.

### Detect
- [ ] Bot posts unauthorized messages, creates channels, or responds to unknown commands.
- [ ] Discord alerts on suspicious login or OAuth grant.
- [ ] Unexpected PM2 / process restart or bot offline event.
- [ ] Unrecognized IP in Discord Developer Portal → Analytics.

### Contain
- [ ] **Kill the bot process immediately:**
  ```bash
  pm2 delete hq-bot        # if running under PM2
  # or
  pkill -f discord-bot.mjs
  ```
- [ ] **Reset the token** in Discord Developer Portal → Bot → Reset Token.
- [ ] Update `.env.local` with the new token before restarting.
- [ ] If the bot was added to unknown servers, leave them (Discord Developer Portal → OAuth2 → Manage Guilds, or use API).
- [ ] If unauthorized webhooks were created, delete them and rotate `DISCORD_WEBHOOK_URL`.

### Rotate / Patch
- [ ] Update `DISCORD_BOT_TOKEN` in:
  - `.env.local` (all dev machines)
  - GitHub Actions secrets (if CI deploys the bot)
  - Vercel env vars (if bot is deployed serverless)
- [ ] Restart the bot:
  ```bash
  pnpm bot
  # or
  pm2 start scripts/discord-bot.mjs --name hq-bot --interpreter node
  ```
- [ ] Verify the bot comes online and responds only to expected guilds/users.
- [ ] Review bot permissions in Discord Developer Portal → OAuth2 URL Generator. Scope down if overly permissive.

### Assess Blast Radius
- [ ] Export server audit logs (Server Settings → Audit Log) for the incident window.
- [ ] Check for: deleted messages, created roles, added bots, changed permissions, webhook creation.
- [ ] Check bot logs (`~/.pm2/logs/` or terminal output) for injected commands or API calls.
- [ ] If the bot has shell passthrough (`!shell`), scan for executed commands.

### Notify
- [ ] `[NOTIFY: Adrian]` — assess whether server members or clients need to be informed.
- [ ] If shell commands touched source code or deployments, follow **Scenario 3** or **Scenario 4** as appropriate.

---

## 3 — Client Data Exposure

Applies to: any unauthorized access, download, or disclosure of client-owned data, PII, or design assets.

### Detect
- [ ] Client reports seeing another client's data in the portal.
- [ ] Unauthorized download or share event in access logs.
- [ ] Cross-tenant data bleed in UI, API response, or database query.
- [ ] Alert from WAF, intrusion detection, or anomaly monitoring.

### Contain
- [ ] **Immediately disable the affected endpoint, page, or user account.**
- [ ] If exposure is via a public deployment, enable Vercel password protection or rollback:
  ```bash
  vercel --prod deploy --target=production   # rollback to last known clean deployment
  ```
- [ ] Screenshot or preserve the exposed data view **before** fixing (for evidence).
- [ ] Restrict affected data in the database or CMS (revoke shared links, disable public access).

### Rotate / Patch
- [ ] Rotate any credentials the attacker may have used (see **Scenario 1**).
- [ ] Patch the root cause:
  - Missing auth check → add middleware / RLS rule.
  - Wrong query filter → fix and add unit test.
  - Misconfigured S3 / CDN bucket → set private ACL and regenerate signed URLs.
- [ ] Run `pnpm test` and `pnpm typecheck` to confirm no regressions.
- [ ] Deploy the fix to production and verify.

### Assess Blast Radius
- [ ] Identify **exact records exposed** (client name, project, file IDs, timestamps).
- [ ] Identify **who accessed them** (IP, user agent, session, time range).
- [ ] Determine if data was **downloaded, cached, or forwarded** (check CDN logs, email logs, webhook payloads).
- [ ] Document everything in `docs/security/audit-log.md`.

### Notify
- [ ] `[NOTIFY: Adrian]` — do not contact the client until Adrian approves the message and timeline.
- [ ] Prepare a factual incident summary: what data, whose data, when, what we did, what we are doing next.
- [ ] If PII of EU residents is involved, assess GDPR 72-hour supervisory-authority notification requirement.

---

## 4 — Critical Dependency CVE

Applies to: `pnpm audit` reports a **critical** or **high** CVE in a production dependency, especially auth/data packages (`discord.js`, `@anthropic-ai/sdk`, `next`, `react`, etc.).

### Detect
- [ ] `pnpm audit` flags a critical/high finding.
- [ ] CI fails on `pnpm audit --audit-level moderate`.
- [ ] External advisory (GitHub Security Advisories, Snyk, OSV) names a package we use.
- [ ] Vendor or client asks about a specific CVE.

### Contain
- [ ] Do **not** merge anything new until the CVE is triaged.
- [ ] If the CVE is in a runtime dependency and has a known exploit, consider a temporary downgrade or feature flag to disable the affected surface.
- [ ] If the affected package is a dev dependency with no production impact, document and continue (see `docs/security/audit-log.md` for acceptance rationale format).

### Rotate / Patch
- [ ] Check if a patched version exists:
  ```bash
  pnpm audit
  pnpm update <package>@latest
  pnpm audit    # verify resolved
  ```
- [ ] If no patch exists, add a `pnpm.overrides` block in `package.json`:
  ```json
  "pnpm": {
    "overrides": {
      "<vulnerable-package>": ">=<patched-version>"
    }
  }
  ```
- [ ] Run `pnpm install` and verify:
  ```bash
  pnpm audit
  pnpm test
  pnpm typecheck
  ```
- [ ] Commit with message: `security: patch CVE-XXXX-XXXX in <package>`.
- [ ] Deploy to production.

### Assess Blast Radius
- [ ] Read the CVE and CVSS vector. Understand: is it RCE, XSS, prototype pollution, auth bypass?
- [ ] Map the vulnerable code path: does HDS actually call the affected function?
  - If unreachable: document with evidence and lower priority.
  - If reachable: treat as active incident until patched.
- [ ] Check if client data or source code could be affected by the exploit class.
- [ ] Update `docs/security/audit-log.md` with CVE ID, CVSS, path, action taken, and verification command output.

### Notify
- [ ] `[NOTIFY: Adrian]` — decide if clients or vendors need proactive notice.
- [ ] If the CVE is in a package that processes client data (e.g., Next.js rendering client pages), notify affected clients after patch confirmation.
- [ ] If no client impact and dev-only, document in audit log only; no external notification needed.

---

## Quick Reference — Key Rotation Commands

| Secret | Rotation Location | Vercel CLI (if deployed) |
|--------|------------------|--------------------------|
| `ANTHROPIC_API_KEY` | console.anthropic.com | `vercel env rm ANTHROPIC_API_KEY production && vercel env add ANTHROPIC_API_KEY production` |
| `OPENROUTER_API_KEY` | openrouter.ai/settings/keys | Same pattern as above |
| `GEMINI_API_KEY` | aistudio.google.com/app/apikey | Same pattern as above |
| `FIGMA_PERSONAL_ACCESS_TOKEN` | figma.com/developers/api#access-tokens | Same pattern as above |
| `DISCORD_BOT_TOKEN` | Discord Dev Portal → Bot → Reset Token | Same pattern as above |
| `DISCORD_WEBHOOK_URL` | Discord channel → Integrations → New webhook | Same pattern as above |
| `YOUTUBE_CLIENT_SECRET` | Google Cloud Console → Credentials | Same pattern as above |

---

## Post-Incident

- [ ] Update `docs/security/audit-log.md` with a dated entry.
- [ ] If controls failed, file a unit in `docs/ai/orchestration.json` to fix the gap.
- [ ] Schedule a 15-minute retro within 48 hours for any incident rated high or above.
