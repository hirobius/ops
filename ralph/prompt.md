# Ralph loop — one iteration

Read AGENTS.md first. Its "Ralph quality bar" section is binding.

## 1. Pick ONE task
Run: gh issue list --label "ralph-ready" --state open
Choose the HIGHEST-PRIORITY issue, not the first. Order:
1. Architecture / core abstractions
2. Integration points between modules
3. Unknowns / spikes
4. Standard features
5. Polish, cleanup, quick wins
If none exist, output `<promise>COMPLETE</promise>` and stop.

## 2. Implement it — small
- One logical change. If the issue is big, ship the smallest complete
  slice and comment the rest back on the issue.
- Follow existing repo patterns. The codebase is the source of truth,
  not your assumptions.

## 3. Pass the gate — required
Run: bash ralph/gate.sh
Must pass with zero errors. If it fails, fix YOUR change until it passes.
Never open a PR on a red gate. Never weaken tests or types to pass it.

## 4. Record progress
Append to progress.txt (terse, grammar optional):
- Issue # + one line
- Decisions + why
- Files changed
- Notes for next iteration

## 5. Ship it
- Branch: ralph/issue-<n>-<slug>
- Commit (match this repo's commit style)
- Open PR with "Closes #<n>" in the body
- Comment the issue with a 2-line summary
- Never merge. Never push to main. A human reviews.
