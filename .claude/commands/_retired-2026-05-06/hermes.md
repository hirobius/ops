Run the Hermes autonomous build loop — full self-improving agent with skill learning.

Routing (all free, all local):
- T1 (mechanical) → hermes3:latest via Ollama
- T2/T3 (standard/architectural) → qwen2.5-coder:14b-hds via Ollama (65K ctx)
- T4 (strategic) → skipped, printed for Claude dispatch

Hermes handles its own tool loop, skill extraction, and self-improvement.
Our orchestration.json claim/done protocol is the coordination layer.

Commands:
- "hermes, go" → `pnpm hermes:start`
- "hermes, dry run" → `pnpm hermes:dry`
- "hermes, run unit <id>" → `pnpm hermes:unit <id>`
