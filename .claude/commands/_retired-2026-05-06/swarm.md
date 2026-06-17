Run the Hermes swarm coordinator — tier-routed multi-model worker pools.

Routing (all free, all local):
- T1 (mechanical) → hermes3 local via Ollama (free, 2 workers)
- T2/T3 (standard/architectural) → qwen2.5-coder:14b-hds local via Ollama (free, 2 workers)
- T4 (strategic) → printed as Claude-only, skipped by swarm

Skill extraction: successful unit runs save tool-call sequences to docs/ai/skills/<cluster>.jsonl for future context injection.

Commands:
- "swarm, go" → `pnpm swarm`
- "swarm, go heavy" → `pnpm swarm:heavy` (T1:3 + T2/T3:4 workers)
- "swarm, dry run" → `pnpm swarm:dry` (routing plan only, no execution)
- "swarm, what's the plan" → `pnpm swarm:dry`

No manual export needed — API keys auto-loaded from .env.local.
