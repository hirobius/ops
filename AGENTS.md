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

## Ralph quality bar

REPO_TYPE: production
QUALITY BAR: Private client automation (Lilac/EZLynx). Correctness over speed. No destructive ops.

Rules for any autonomous loop in this repo:

- One issue per PR. Small steps. Never push to main.
- The gate (ralph/gate.sh) must pass before any PR. No exceptions.
- Fight entropy: leave the code better than you found it.
- No shortcut that creates debt someone else pays for.
- Merges are HUMAN-approved: `ralph-approved` on the PR, or the issue
  pre-tagged `ralph-auto` (batch approval). Never merge yourself.

Loop mechanics (see `ralph/README.md` for the full contract):

- Labels: `ralph-ready` (queue, human) · `p0`–`p3` (priority, human) ·
  `ralph-auto`/`ralph-approved` (merge approval, human) · `ralph-wip`
  (claimed, loop) · `ralph-parked`/`needs-adrian` (parked with reason, loop) ·
  `ralph-selfheal-attempted` (gate's one bounded repair, spent).
- Selection is deterministic (`ralph/next.sh`: priority label, then issue #);
  claims are atomic (`refs/heads/ralph/claim-<n>`); the loop's exit codes are
  a contract (`ralph/run.sh` header). Agents never touch `ralph-*` labels,
  claim refs, or `ralph/{.lock,runs.jsonl,logs/}` — the harness owns those.
