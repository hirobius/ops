Run the Kimi autonomous build loop. Executes the full pre-flight sequence:
1. `node scripts/audit-claims.mjs` — clear any stale claims
2. `node scripts/orchestration-watcher.mjs --once --quiet` — refresh ready-queue
3. `node scripts/kimi-agent.mjs --loop` — start the autonomous unit executor

API key is auto-loaded from `.env.local`. No manual export needed.

For parallel workers, ask for concurrency: "kimi, go with 4 workers" → `pnpm kimi:start:4`
