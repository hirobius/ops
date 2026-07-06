# AGENTS.md

Operating notes for code agents working in **Hirobius Ops** — the agency
operations dashboard. It consumes `@hirobius/design-system`; it does not author
the design system.

## Read first

- [CLAUDE.md](./CLAUDE.md) — hard rules, execution protocol, sub-agent dispatch rules (the primary entrypoint).
- [docs/ai/HANDOFF.md](./docs/ai/HANDOFF.md) — current state / what's next.
- [docs/ai/NORTH_STAR.md](./docs/ai/NORTH_STAR.md) — the focus contract (scope guard).
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — the lead → site delivery pipeline + decisions.
- [BACKLOG.md](./BACKLOG.md) — active backlog and work status.
- [SYSTEMS_REGISTRY.md](./SYSTEMS_REGISTRY.md) — system-level inventory.

## Scripts

Flat `scripts/` toolchain. To find a script by what it does, read
**`scripts/INDEX.md`** (human) or **`scripts/INDEX.json`** (machine) — a
generated, categorised map of every script with its one-line purpose, `pnpm`
alias, and firing channel. Regenerate with `node scripts/generate-script-index.mjs`.

Quality gates are registered in `docs/guardrails/registry.json`
(`validate-guardrail-registry` keeps registry ↔ scripts consistent).

## Guidance hygiene

- Update this file and [CLAUDE.md](./CLAUDE.md) only with stable, repo-wide rules.
- Do not reference missing docs, folders, or workflows as if they exist.
- When the repo structure changes, update this file to match reality rather than preserving aspirational architecture.
