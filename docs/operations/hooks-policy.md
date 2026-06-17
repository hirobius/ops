# Git Hooks Policy

**Goal:** Prevent duplicate or fragmenting commits from auto-update hooks.

## Rule

**NO per-commit hooks may trigger data writes that result in amends or extra commits.**

### Specific violations to prevent

- ❌ post-commit hook → amend current commit
- ❌ post-commit hook → create new `chore: auto-update` commit (noise)
- ❌ pre-commit hook → stage & auto-commit (defeats incremental staging)

### Why?

Cherry-pick, rebase, merge, and CI artifacts all break if a hook fires during the operation. Each agent session with multiple commits becomes fragile as more hooks auto-amend or auto-stage.

## Current hooks

| Hook | Script | Purpose | Constraints |
|------|--------|---------|-------------|
| pre-commit | `.husky/pre-commit` | typecheck, lint, manifest drift | read-only checks only |
| pre-push | `.husky/pre-push` | full CI suite simulation | read-only checks only |

## One-time or cron tasks

Tasks that update derived files (history, reports, ledgers) run **once per session** or **daily**, never per-commit.

### Example: commit-history.json

**Old (violates policy):**
```bash
# .husky/post-commit
node scripts/update-commit-history.mjs
```
→ Triggers on every commit, creates merge noise.

**New (policy-compliant):**
```bash
# Manual refresh anytime
pnpm history:refresh

# Or daily cron (future)
# 00 00 * * * cd /repo && pnpm history:refresh
```

## Implementation

- Scripts that update history, manifests, or ledgers live in `scripts/*-cron.mjs`
- Wire them to:
  - Manual commands in `package.json` (e.g., `pnpm history:refresh`)
  - Daily systemd timers or GitHub Actions scheduled workflows
  - OPERATOR_BRIEF session post-merge hooks (not git hooks)
- Never invoke from `.husky/` or `.git/hooks/`

## Testing

After any hook change:
```bash
git config core.hooksPath && ls .husky/ && echo "✓ hooks registered"
git log --oneline -5  # Verify no duplicate commits
```

## See also

- `CLAUDE.md`: Agent execution protocol §6 (GATES)
- `docs/ai/AGENT_GUIDELINES.md`: §7 claim/done transition
