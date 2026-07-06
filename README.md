# Hirobius Ops

The agency operations dashboard. It runs the **lead → site pipeline**, a
**client CRM**, and fleet views for projects, digest, and tasks. It **consumes**
`@hirobius/design-system` for its UI — the design system itself lives in its own
repo; this repo does not author it.

Stack: Vite + React Router + TypeScript, Vercel serverless functions
(`api/*.ts`, mirrored by Vite dev middleware), Supabase for the leads/tasks
store.

## Quick start

```bash
pnpm install
pnpm dev          # dev server bypasses the /ops password gate
```

Core commands:

```bash
pnpm typecheck
pnpm test:layout  # route-coverage + Playwright layout-integrity
pnpm build
```

## What's here

- **Leads → site pipeline** — `lib/lead-gen` (Outscraper sourcing) → `lib/agent`
  (enrich → generate → judge → loop, emits a validated `ClientConfig`) →
  `lib/render` (hands off to the `hirobius/clients` Astro factory). Triggered
  from the `/ops/leads` board; state lives in Supabase (`lib/leads`, `lib/supabase`).
- **Client CRM** — `clients/<slug>/*.json` rendered by the `/ops/clients` pages;
  a public token-gated portal at `/c/:slug`.
- **Fleet views** — `/ops` index (system strength, pillars), projects, digest,
  tasks, admin approvals.
- **`/ops` gate** — server-side password (`api/ops-login.ts`); production only.

## Where to read

- `CLAUDE.md` — agent rules + dispatch conventions (start here).
- `docs/ai/HANDOFF.md` — current state / what's next.
- `docs/ai/NORTH_STAR.md` — the focus contract (scope guard).
- `docs/ARCHITECTURE.md` — the lead → site delivery pipeline + decisions.
- `docs/guardrails/registry.json` — the quality-gate registry.

## Repository shape

```text
src/app/        React dashboard (pages, components, lib)
api/            Vercel serverless functions
lib/            framework-agnostic engine (agent, lead-gen, leads, render, schema)
clients/        per-client CRM data (gitignored real clients; _template tracked)
scripts/        gates, generators, dev middleware
docs/           architecture, ai/handoff, guardrails
```
