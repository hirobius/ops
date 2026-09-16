# Model Tiers — two-lane routing for the auto-assigner

Hirobius routes every dispatched task across **two tiers**. The tier is the first decision the auto-assigner makes; model-within-tier and effort follow deterministically. This document is the canonical reference for which model belongs to which tier and why.

> **History:** This used to be a three-tier system (open-local / open-remote / closed-frontier) with a paid open-weights remote provider in the middle slot. The open-remote tier was removed on 2026-05-06 — collapsed to two tiers on the principle that one paid vendor (Anthropic) is enough until a clear case appears for another. Add a third tier back if and when a paid open-weights inference provider justifies the operational surface.

## Why two tiers, not "which model"

For Hirobius, model choice splits cleanly along a single axis: **does the data leave the operator's machine?**

| Tier | Privacy | Cost | Latency | Capability ceiling |
|------|---------|------|---------|--------------------|
| **Open · local**     | High (data never leaves the host) | $0 (electricity only) | Medium | Moderate (good enough for routing + classification + small gen + simple refactors) |
| **Closed · frontier**| Lower (data goes to Anthropic) | High ($/1M tokens) | Low | Highest (architectural reasoning, ambiguous scope, novel logic) |

Routing by tier — not by model — keeps the assigner's logic stable as new models drop into each lane.

## Tier roster

### Open · local (Ollama on workstation or VPS)

| Model | Role |
|-------|------|
| `gemma4:e4b`             | **Default classifier / router.** 4B edge model — fast, JSON-disciplined, low RAM (~6GB). Used by `scripts/auto-assigner.mjs`. |
| `gemma4:26b`             | Local generation (MoE, 3.8B active). Replaces what paid remote models did for non-privacy-sensitive small gen tasks. Needs ~16GB RAM. |
| `hermes3:latest`         | T1 mechanical work via `scripts/hermes-unit.mjs`. Scrubs, renames, comments. Default Hermes Agent kanban orchestrator. |
| `qwen2.5-coder:14b-hds`  | T2 component / schema / script work via `scripts/hermes-unit.mjs`. Coder-tuned. |

**Privacy note:** open-local is the only tier acceptable for client data (Lilac inboxes, Conrad's call recordings, EZLynx data). Auto-assigner forces tier=`open-local` whenever classifier flags `privacy: 'high'`.

### Closed · frontier (Anthropic, via Claude Code in-window subagents or `claude -p` skill)

| Model | Role |
|-------|------|
| `haiku-4-5`   | T1 mechanical via Claude Code `Agent` dispatch. **Removed from autonomous dispatch (2026-05-04)** — defect rate cost more in repairs than dispatch saved. Reserve for human ideation / scratch-pad use. |
| `sonnet-4-6`  | Default coding tier. **Required** for deletions per CLAUDE.md (sonnet-judgment rule, 2026-05-01). What `pickModel(closed-frontier, *)` returns by default. |
| `opus-4-7`    | Cross-cutting architectural reasoning, ambiguous scope, novel validators. Used sparingly — most expensive lever. |

**Standing directive (Adrian, 2026-05-01):** always pick the cheapest model that can do the job. Within closed-frontier, default to sonnet (haiku is banned, opus is reserved).

**Access path for the kanban:** the `claude-code` skill (`~/.hermes/skills/autonomous-ai-agents/claude-code/`) shells out to `claude -p`, which uses your local Claude Code Pro/Max subscription via browser OAuth. Net new API spend: $0 (subject to subscription quota).

## Auto-assigner derivation

`scripts/auto-assigner.mjs` runs the classifier (`gemma4:e4b`), then derives tier and model deterministically:

```
classify(input) → { verdict, privacy, capability, effort, reason }

pickTier({ privacy, capability }):
  privacy === 'high'                                  → open-local
  capability === 'advanced' && privacy !== 'high'    → closed-frontier
  capability === 'moderate'                          → closed-frontier
  default                                             → open-local

pickModel(tier, effort):
  open-local      + effort 'min'        → gemma4:e4b
  open-local      + effort 'standard'   → gemma4:26b
  open-local      + effort 'high'       → gemma4:26b
  closed-frontier + effort 'min'        → sonnet-4-6  (haiku banned)
  closed-frontier + effort 'standard'   → sonnet-4-6
  closed-frontier + effort 'high'       → opus-4-7
```

Manual override:
```
node scripts/auto-assigner.mjs --client lilac-insure --task-id ai-1 \
  --force-tier closed-frontier --force-model sonnet-4-6
```

The audit log (`docs/ai/routing-log.jsonl`) records both the classifier output and any forced overrides — so post-hoc analysis can find drift between the model's calls and the operator's interventions.

## Cost ceiling enforcement

The price table in `scripts/auto-assigner.mjs` and `scripts/cost-ceiling-gate.mjs` (USD per 1M tokens, May 2026 estimates):

| Model | Price |
|-------|-------|
| All `gemma*` / `hermes*` / `qwen*`   | $0 |
| `haiku-4-5`   | $1.00 |
| `sonnet-4-6`  | $3.00 |
| `opus-4-7`    | $15.00 |

Update both scripts when prices shift; the duplication is intentional at this scale (extract to `scripts/lib/model-tiers.mjs` when a third consumer appears).

Effort multipliers (estimated tokens per task):

| Effort | Tokens |
|--------|--------|
| min       |  2,000 |
| standard  |  8,000 |
| high      | 30,000 |

Projected cost = `price_per_M_tokens × effort_tokens / 1_000_000`. Auto-assigner sets `costCeiling = projected × 1.25` (25% headroom). The gate refuses dispatch when `costSpent + projected > costCeiling`.

## When to update this doc

- A model is renamed or deprecated by its vendor.
- A new tier is introduced (e.g. open-remote when a paid open-weights inference provider is wired back in).
- The price table shifts by more than ~20%.
- Routing logic in `auto-assigner.mjs` changes its derivation rules.
