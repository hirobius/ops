# Hirobius Ops

The **command center** for running the agency from one place instead of hopping
between platforms. It runs the **lead → site pipeline**, a **client CRM**, and a
**task board**, and uses **GitHub Issues + Claude Code as the automation bus** —
so work can be handed to an agent with no per-token API key, just the Claude
Code + GitHub subscription.

It **consumes** `@hirobius/design-system` (public npm) for its UI — the design
system lives in its own repo; this repo does not author it.

**Stack:** Vite + React Router + TypeScript · Vercel serverless functions
(`api/*.ts`, mirrored by Vite dev middleware) · Supabase (leads + tasks store).
Deployed on Vercel; `main` is production.

## What it does today

- **`/ops/tasks` — the task board.** One board over every task, backed by the
  Supabase `tasks` table. Seed/refresh it from `BACKLOG.md` with the **import
  backlog** button (`POST /api/tasks-import`, server-side, idempotent). Each card
  can be marked **Done**, **Dispatched**, or trashed.
- **The dispatch loop (no API key).** **Dispatch** opens a GitHub Issue that
  `@claude`s — GitHub then spins up a Claude Code session on a branch that opens
  a PR. The board stamps the issue URL and `claimed_by='claude'`. Needs
  `GITHUB_TOKEN`. *(Direction: GitHub Issues become the source of truth; the
  board becomes a triage + launcher + multi-repo issue view.)*
- **`/ops/leads` — lead → site pipeline.** `lib/lead-gen` (Outscraper sourcing)
  → `lib/agent` (enrich → generate → judge → loop → validated `ClientConfig`) →
  `lib/render` (hand-off to the `hirobius/clients` Astro factory). State in
  Supabase (`lib/leads`, `lib/supabase`).
- **`/ops/clients` — client CRM.** `clients/<slug>/*.json` rendered as client
  dashboards / reports / brand audits, plus a public token-gated portal at
  `/c/:slug`.
- **`/ops/projects`, `/ops/digest`, `/ops` index, `/admin/approvals`** — fleet
  views + the approval inbox.
- **The `/ops` gate.** Server-side password: `api/ops-login.ts` checks
  `OPS_GATE_PASSWORD` + `OPS_SESSION_SECRET` and sets an httpOnly session cookie.
  `pnpm dev` bypasses it; production is gated.

## Production config (Vercel env vars)

Set by a human in the Vercel dashboard (Production scope) — never committed.

| Variable | Purpose | Needed for |
| --- | --- | --- |
| `OPS_GATE_PASSWORD`, `OPS_SESSION_SECRET` | server-side `/ops` login | the whole dashboard |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase service client | tasks + leads boards |
| `GITHUB_TOKEN` (+ optional `GITHUB_REPO`) | open dispatch issues (Issues: write) | the Dispatch loop |
| `OUTSCRAPER_API_KEY` | Places sourcing | live lead pulls |
| `VITE_PORTAL_HMAC_SECRET` | `/c/:slug` portal token | client portal |

The Supabase↔Vercel integration may inject `NEXT_PUBLIC_SUPABASE_URL` instead of
`SUPABASE_URL`; the server accepts either. Schema lives in
`supabase/migrations/` (run `0001`–`0003`).

## Quick start

```bash
pnpm install
pnpm dev          # dev server bypasses the /ops password gate
```

Core commands:

```bash
pnpm typecheck
pnpm test         # vitest (unit + api handlers)
pnpm test:layout  # route-coverage + Playwright layout-integrity
pnpm build        # prebuild (ensure-ops-data) → vite build
```

## Where to read

- `CLAUDE.md` — agent rules, working-with-Adrian conventions, dispatch rules (start here).
- `standards/secrets-management.md` — **org-wide Secrets Management Standard** (canonical home; every Hirobius repo links here). Fleet adoption tracked in `standards/secrets-adoption.md`.
- `docs/ai/HANDOFF.md` — current state / what's next.
- `docs/ai/NORTH_STAR.md` — the focus contract (scope guard).
- `docs/ARCHITECTURE.md` — the lead → site delivery pipeline + decisions.
- `docs/guardrails/registry.json` — the quality-gate registry.

## Repository shape

```text
src/app/        React dashboard (pages, components, lib)
api/            Vercel serverless functions (ops-login, tasks, tasks-import, task-action, leads, projects, …)
lib/            framework-agnostic engine (agent, lead-gen, leads, render, schema, github, supabase, tasks)
clients/        per-client CRM data (gitignored real clients; _template tracked)
supabase/       SQL migrations (leads, tasks)
scripts/        gates, generators, dev middleware, ensure-ops-data
docs/           architecture, ai/handoff, guardrails
```
