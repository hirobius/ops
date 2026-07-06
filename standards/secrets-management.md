# Hirobius Secrets Management Standard

> **Scope:** every Hirobius repo and every client engagement. This is the one
> way we store, name, scope, and deploy secrets. Its job is to make
> cross-contamination structurally impossible — a key is always owned by exactly
> one party and lives in exactly one place.
>
> **Canonical home:** this file, in **`hirobius/ops`** (`standards/secrets-management.md`),
> is the authoritative copy. Every other repo links here rather than forking the
> text. Adoption across the fleet is tracked in
> [`secrets-adoption.md`](./secrets-adoption.md). Reference implementation:
> `hirobius/lilac-insure` (the first client fully on the standard).

## Principles

1. **Bitwarden is the single source of truth.** Repos never contain secret
   *values* — only the env-var *names*.
2. **Every secret has exactly one owner:** either **Internal (Hirobius)** or **a
   specific client**. Never both. A key used by both is a smell — split it.
3. **Least privilege.** One scoped credential per system per client; a dedicated
   read-only / integration user wherever the vendor allows it.
4. **`.env.local` is a machine-local copy** populated from Bitwarden, never
   committed. Servers/CI inject from the secrets manager, not from files.

## Bitwarden structure (the isolation boundary)

Use a Bitwarden **Organization**. **Collections are the boundary** that stops
cross-contamination:

- **One collection per client** — `Lilac Insurance`, `Acme Co`, …
- **One `Hirobius — Internal` collection** for your own infra/dev/tooling keys
  (GitHub PATs, Vercel, domain, CI, etc.).
- Share a client collection **only** with the people who operate that client.
  (No Org yet? Use a **Folder** per owner as the poor-man's version — same
  naming, weaker isolation.)

## Item convention

- **One item per credential *set*** (per system) — never one mega-note.
- **Item name:** `<Owner> — <System> — <purpose>`
  - `Lilac — EZLynx API`
  - `Lilac — Gravity Forms REST (read-only)`
  - `Hirobius — GitHub PAT (packages)`
- **Custom fields = env-var names.** Store each value in a field whose label is
  the *exact* env-var name, so it maps 1:1 into `.env.local`:
  - `Lilac — EZLynx API` → `EZLYNX_API_URL`, `EZ_USER`, `EZ_PASSWORD`, `EZ_APP_SECRET`
  - `Lilac — Microsoft Graph app` → `MS_GRAPH_TENANT_ID`, `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET`
- **Notes field records:** which repo(s)/machine(s) it's deployed to, created
  date, last-rotated date, and the permission scope granted.

### Which Bitwarden item type

| What you're storing | Item type |
|---------------------|-----------|
| **SSH private key** (git / server auth) | **SSH Key** item — used via the Bitwarden SSH agent, so the key authenticates without ever being copied to disk. |
| **API keys / tokens / client secrets / env-var values** | **Login** item with **hidden** custom fields (label = env-var name; base URL in the URI slot). Field masking + searchable. |
| Genuinely unstructured misc | Secure Note (fallback only). |

- **SSH private keys never go in a Secure Note** — use the SSH Key item type.
- **API secrets never go in the SSH agent** — it's for SSH keys only; use a Login
  item with hidden fields.
- Reserve Secure Notes for truly unstructured content — no field masking, easy to
  fat-finger.

## The repo contract

- Repo holds **only env-var names** in `.env.example`, with a one-line comment on
  where each is obtained.
- Real values live in `.env.local`, gitignored via `.env`, `.env.local`,
  `.env.*.local`.
- **Nothing secret is ever committed, pasted into chat/AI, or emailed.**

## Cloud / Claude Code environments (no local machine)

When you work entirely in the cloud (Claude Code on the web, long-running remote
environments), the container is ephemeral and there's no durable local disk — so
**don't hand-manage a `.env.local` file inside it.** Instead:

- **Set secrets as the environment's configured environment variables** (the
  Claude Code environment's env-var settings). Every session then has them in
  `process.env`, and our loaders read `process.env` directly — no file to manage,
  nothing to commit. (`loadEnvLocal()` only fills vars that aren't already set,
  so environment-provided values win and a `.env.local` becomes optional.)
- **Or inject at session start:** a setup script / SessionStart hook that pulls
  from your secrets manager (Bitwarden CLI `bw`, Doppler `doppler run`, 1Password
  `op`) and exports the vars — so any `.env.local` is generated fresh each
  session and never persists or gets committed.
- **One environment per owner.** Never put two clients' secrets in the same cloud
  environment — same isolation rule as Bitwarden collections. A Lilac environment
  holds only Lilac's keys.

### The dev-vs-production boundary (important)

A cloud build/dev environment is the right home for **test / dev-tenant
credentials** while building. It is **not** where production automations that
touch real client PII should run. Per each client's architecture, the live
workflows run on the **client's own infrastructure** (their PC / VPS) so client
data never leaves it. Keep **test creds** (cloud dev env) and **production creds**
(client infra) as separate Bitwarden items, and never load a client's production
keys into a shared cloud environment.

## Transferring a secret

Use **Bitwarden Send** (one-time, expiring link) to hand a secret to or from a
client. Never Slack/email/DM/paste-into-a-tool.

## Rotation

Rotate **on exposure, on offboarding, and on a schedule** for high-value keys.
Order: update Bitwarden → redeploy `.env.local` / CI → revoke the old value.

## Sorting an existing repo (the cleanup playbook)

Run this per repo to fix cross-contamination that already exists:

1. **Inventory.** List every secret the repo uses — check `.env.example`,
   `.env.local`, CI/deploy config, and search history:
   `git log -p | grep -iE 'key|secret|token|password'` (or use trufflehog / gitleaks).
2. **Classify** each: **Internal** or **which client**?
3. **Move** each into the correct Bitwarden collection; **rename** to the
   convention; **split** any item that mixes owners.
4. **Fix the repo:** `.env.example` = names only; confirm `.gitignore` covers
   `.env*`.
5. **Scan history** for committed secrets. If any are found: **rotate them** and
   purge from history (BFG / `git filter-repo`).
6. **Record** deployment targets + scope in each item's notes.

## Per-repo adoption checklist (copy into each repo's PR)

- [ ] `.env.example` lists env-var **names only**, each with a source note
- [ ] `.gitignore` covers `.env`, `.env.local`, `.env.*.local`
- [ ] every secret lives in a Bitwarden collection (a client's, or `Hirobius — Internal`)
- [ ] items named `<Owner> — <System> — <purpose>`; fields labelled with env-var names
- [ ] no single key shared across owners
- [ ] git history scanned; any leaked secret rotated + purged
- [ ] least-privilege scopes confirmed (dedicated read-only users where possible)

## Owner classification — quick reference

| Key type | Owner | Collection | Example |
|----------|-------|-----------|---------|
| Your infra / tooling | Hirobius | `Hirobius — Internal` | GitHub PAT, Vercel, domain, CI |
| A client's systems | That client | `<Client>` | EZLynx, their M365 Graph app, their Gravity keys |
| Shared vendor you resell | Hirobius (master) + per-client sub-keys | split | one master in Internal, scoped sub-keys per client |

If you can't decide who owns a key, it's Internal until proven client-scoped —
and if a client ever needs it, mint them their **own** scoped key rather than
sharing yours.

---

_Canonical copy — edit here, in `hirobius/ops`. Downstream repos link to this file; they do not fork the text._
