# Hirobius Ops — Architecture

Org source of truth for cross-cutting delivery decisions in the ops command
center. Component-level ADRs live under `docs/architecture/`; this file holds the
agency-wide contracts and the lead → site delivery pipeline.

---

## Client-site delivery

(Decision recorded 2026-06-18, from the `hirobius/clients` Duda-delivery handoff.)

- **Production render target: Duda** (rented, white-label, managed). One Duda site
  per client, created from a per-preset template via the Duda API.
- **Reference render target: Astro** (`hirobius/clients` → `packages/template`,
  `apps/*`). Demo + portfolio + where the schema was proven. NOT the production
  fleet — do not scale it past the demo.
- **The contract: `ClientConfig`** (`hirobius/clients` → `packages/schema`). The
  agent emits it; every render target consumes it. Do not fork it.
- **Engine (the moat, platform-agnostic):** schema + lead-gen + agent. Sourced in
  `clients`, ported into `lib/` here (`lib/lead-gen`, `lib/agent`, `lib/duda`),
  triggered from the ops board.

Flow: `lead → enrich → generate → judge → ClientConfig → renderToDuda → preview →
(on "yes") publish + domain`.

Lifecycle on the `leads` row:
`sourced → generating → scored → rendered → sent → won/lost`.

Spike + full `ClientConfig → Duda` mapping: `hirobius/clients` →
`docs/DUDA-DELIVERY.md`. Reconciliation with what's already scaffolded here +
the condensed mapping: `docs/operations/lead-pipeline-platform-integrations.md`.

> Repo-stack note: ops is **Vite + React Router + Vercel serverless functions**,
> not Next.js App Router. The handoff's `app/api/.../route.ts` examples are App
> Router; here those become `api/<name>.ts` Vercel functions (mirrored by Vite dev
> middleware), matching the existing `api/route.ts`.
