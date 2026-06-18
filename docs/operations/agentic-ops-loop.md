# Agentic ops loop — daily review → Discord CTAs → dispatch

Design doc for the orchestration loop Adrian wants: a daily cron analyzes the app,
posts improvement/refactor findings to Discord, each with CTAs (**Proceed / Punt /
Backlog**); a CTA dispatches an agent to do the work (or backlogs/dismisses), and
the loop closes when the agent reports back and the finding clears. Core goal:
**orchestration + looping agentic commands** as a first-class ops function.

Status: proposal. Nothing built yet — slices below.

## Reuse what already exists (don't rebuild)

- `scripts/discord-bot.mjs` (`pnpm bot`) — Discord presence already wired.
- `scripts/audit-*.mjs` / `check-*.mjs` — deterministic analyzers (knip dead code,
  `audit-deps`, `audit-bundle`, token drift, guardrail registry). **Findings source.**
- `scripts/auto-assigner.mjs` + `api/route.ts` — the existing dispatch path
  (dashboard → `/api/route` → HMAC → Hetzner assigner → mutates `clients/*/tasks.json`).
- `docs/ai/proposed-units.jsonl` — append-only "proposed work" seam (already the
  intended agent-proposal inbox).
- `telemetry/events.jsonl` — event log. `vercel.json` — supports `crons`.

## Architecture

```
[ daily cron ] → scripts/daily-review.mjs → findings.jsonl + Supabase `findings`
       │                                            │
       ▼                                            ▼
[ Discord digest ]  ── Proceed / Punt / Backlog ──► [ /ops/review board (same store) ]
       │ (button)                                    │ (same CTAs)
       ▼                                             ▼
[ api/discord-interactions.ts ] ──► action: Proceed → enqueue dispatch
                                              Backlog → BACKLOG store
                                              Punt    → snooze (TTL)
       │
       ▼
[ dispatcher (Hetzner) ] → agent works on a branch → posts back → finding cleared → loop
```

1. **Analyzer (cron, daily)** — `scripts/daily-review.mjs`: run the deterministic
   audits + an optional LLM synthesis pass over recent diffs / hotspots → write
   structured findings (`id, title, rationale, effort, risk, suggested_action,
   files`) to `docs/ai/findings.jsonl` and a Supabase `findings` table.
2. **Notify** — post a daily digest to Discord; one card per finding with buttons
   **Proceed / Punt / Backlog** (+ "Open diff").
3. **Interaction endpoint** — `api/discord-interactions.ts` (Vercel function)
   verifies Discord's Ed25519 signature, records the choice, acks.
4. **Dispatch** — Proceed creates an agent task via the existing seam (write task →
   Hetzner auto-assigner picks it up / kicks a Claude Code run). Agent works on a
   branch, never main.
5. **Close** — agent posts back to Discord (done + branch/PR link); finding marked
   resolved. Loop.

## Two faces, one store

Mirror the leads pattern: a Supabase `findings` table is the system of record, and
**both** Discord **and** an `/ops/review` board render + action it with the same
CTAs. Action from your phone (Discord) or the dashboard — same result.

## Where each part runs

- **Vercel:** analyzer cron trigger, the signed Discord interactions endpoint, and
  writing findings. (Functions are short-lived — fine for triage, not for agents.)
- **Hetzner VPS** (already in the stack): the agent dispatcher/executor — long jobs
  can't run in a Vercel function. Matches where `auto-assigner.mjs` already lives.

## Open forks (decide before building)

1. **Dispatch backbone** — Hetzner auto-assigner (exists) vs Claude Code web
   sessions vs a new queue. The orchestration layer is "in flux" per CLAUDE.md;
   this is the key call.
2. **Findings source** — deterministic audits only (cheap, safe) vs + LLM synthesis
   (richer, costs tokens).
3. **Cron host** — Vercel cron vs VPS cron.
4. **Channel of record** — recommend **both** Discord + dashboard against one
   Supabase store (consistent with leads).
5. **Guardrails** — Proceed always requires a human click; agents work on a branch +
   PR, never push to main, never auto-merge (matches CLAUDE.md hard rules).

## Phased build

- **Slice 1 (safe, no auto-dispatch):** `scripts/daily-review.mjs` (deterministic
  audits → `findings.jsonl`) + Discord digest via webhook (`DISCORD_WEBHOOK_URL`).
  Read-only; you eyeball findings. Value on day one, no new auth surface.
- **Slice 2:** Supabase `findings` table + `/ops/review` board with CTAs
  (dashboard-actioned; Proceed writes a task to the existing dispatch seam).
- **Slice 3:** Discord interactive buttons (`api/discord-interactions.ts`) wired to
  the same actions.
- **Slice 4:** close-the-loop reporting (agent → Discord/board status) + punt TTLs +
  backlog sync.

Recommended start: **Slice 1** — it only needs the audit runners (exist), a Discord
webhook URL, and a cron entry; no agent auto-dispatch, no new auth.
