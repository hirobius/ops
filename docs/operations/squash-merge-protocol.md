# Squash-Merge Protocol — fix/* → main

> Full automation: `scripts/merge-squash.mjs` (run via `pnpm merge:squash`).
> Abbreviated summary: `docs/operations/release-tagging.md`.

---

## Why squash-merge?

`fix/*` branches accumulate:
- Agent `chore(orch):` claim commits
- `chore(history): post-commit auto-update` noise commits
- Incremental fixups from failing gates

Squashing these into a single, coherent landing commit on `main` keeps the main branch readable, bisect-able, and easy to reason about for future agents and for Adrian.

---

## Prerequisites

Before running the protocol, verify:

1. All mandatory gates pass on the `fix/*` branch tip:
   ```bash
   pnpm typecheck
   node scripts/validate-manifest.mjs
   node scripts/validate-orchestration.mjs
   node scripts/check-manifest-drift.mjs
   node scripts/check-binding-drift.mjs
   node scripts/check-source-canon.mjs
   ```

2. No active claims (stale or otherwise) on `orchestration.json`:
   ```bash
   node scripts/audit-claims.mjs
   ```

3. A clean working tree (`git status` shows nothing unstaged/uncommitted).

---

## The 6-Step Sequence

### Step 1: Tag the baseline

Create an annotated pre-merge tag on the `fix/*` branch tip. This is the rescue point.

```bash
# On fix/ui-pipeline
VERSION=$(node -e "const p=require('./package.json'); console.log(p.version)")
git tag -a "v${VERSION}-pre-merge" -m "$(cat <<'EOF'
fix/ui-pipeline tip — pre-squash-merge baseline

Session delta:
- See git log for unit-by-unit detail

All validation gates pass at this commit.
EOF
)"
```

**CRITICAL:** The baseline tag MUST exist before Step 2. If the rebase or squash loses commits, this tag is the recovery point.

### Step 2: Optional — squash noise commits (interactive rebase)

Agent `chore(orch):` claim commits and `chore(history): post-commit auto-update` commits can be folded into their parent unit commits using interactive rebase. This is optional but produces a cleaner history.

```bash
# Identify the merge-base between fix/ui-pipeline and main
BASE=$(git merge-base main fix/ui-pipeline)

# Rebase interactively from the merge-base
# In the editor: change "pick" to "fixup" for chore(orch): claim commits
# and for chore(history): post-commit auto-update commits
git rebase -i "${BASE}"
```

Skip this step if the branch is complex or if there is any doubt. A squash-merge in Step 3 will compress everything into one commit regardless.

### Step 3: Squash-merge onto main

```bash
git checkout main
git merge --squash fix/ui-pipeline
git commit -m "$(cat <<'EOF'
feat(release): vX.Y.Z — Phase 12 autonomous build session

<one-paragraph summary of what landed>

Units completed: <comma-separated list of unit IDs>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

The commit message should reference the unit IDs that landed. The `pnpm merge:squash` script auto-populates this from `orchestration.json` done-since-baseline units.

### Step 4: Tag main

```bash
VERSION=$(node -e "const p=require('./package.json'); console.log(p.version)")
git tag -a "v${VERSION}" -m "Release v${VERSION} — <one-line summary>"
```

### Step 5: Verify main gates (critical)

```bash
pnpm typecheck
node scripts/validate-manifest.mjs
pnpm build
```

If any gate fails on main: revert the squash-merge commit (`git revert HEAD`), switch back to `fix/*`, fix the issue, and repeat from Step 1.

### Step 6: Push (Adrian-only, never in autonomous runs)

```bash
# NEVER RUN AUTONOMOUSLY — requires explicit Adrian instruction
git push origin main
git push --tags
```

After push:
```bash
git branch -d fix/ui-pipeline
git push origin --delete fix/ui-pipeline
```

---

## Recovery from a Bad Squash

If Step 3 squashes the wrong commits or loses work:

```bash
# Reset main to before the squash
git checkout main
git reset --hard HEAD~1   # undo the squash-merge commit

# Restore the fix/* branch from the pre-merge tag
git checkout -b fix/ui-pipeline-recovered "v${VERSION}-pre-merge"
```

---

## Automated Script

`scripts/merge-squash.mjs` automates Steps 1–5. Usage:

```bash
pnpm merge:squash
```

Or with options:
```bash
node scripts/merge-squash.mjs --dry-run      # show what would happen, no writes
node scripts/merge-squash.mjs --skip-rebase  # skip the interactive rebase step (default)
node scripts/merge-squash.mjs --from fix/ui-pipeline --into main
```

The script:
1. Verifies it is on a `fix/*` branch and all gates pass.
2. Tags the baseline (`vX.Y.Z-pre-merge`).
3. Runs the squash-merge onto main.
4. Generates a commit message from `orchestration.json` done-since-baseline units.
5. Tags main (`vX.Y.Z`).
6. Reports success and instructs the operator to manually push.

---

## Tie-in to Orchestration Units

| Unit | Role |
|---|---|
| `12s-infra-tag-baseline-pre-merge` | Release tagging protocol (this doc's sibling) |
| `12s-infra-pre-merge-squash-protocol` | Full squash-merge automation + script (THIS unit) |
| `12s-infra-done-status-validator` | Audits every `done` unit's validationCmd post-tag |

---

*Created: 2026-05-02 by session:fresh-2026-05-02-w2-L9 executing 12s-infra-pre-merge-squash-protocol.*
