# Ralph loop — one iteration

Read AGENTS.md first. Its "Ralph quality bar" section is binding.

The issue to work arrives as `ISSUE=<n>` in your instructions — the harness
(ralph/run.sh or the CI guard) selected and claimed it deterministically.
**You never pick a task and never look for another one.**

## 1. Understand the task
Run: gh issue view <n> — read the title, body, acceptance criteria, comments.

If it is genuinely ambiguous, or needs a human decision, or is blocked on
something you cannot resolve this iteration, do a **clean blocked-stop** — this
is a first-class outcome, NOT a failure, and it is always better than guessing:

1. Post an issue comment whose **first line is exactly** `ralph-blocked: <one-line reason>`
   (put the detail/options below it). That marker is load-bearing: the harness
   keys on it to route the issue to a human WITHOUT counting a failed attempt or
   re-picking it. Skip the marker and your deliberate stop looks identical to a
   crash — it burns an attempt and the loop retries a blocker it can't clear.
2. Do NOT open a PR. Do NOT touch labels (the harness applies `needs-adrian`).
3. STOP. The harness reconciles the rest.

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
- Branch: ralph/issue-<n>-<slug> — EXACTLY this shape; the harness keys
  reconciliation on it, and it makes a racing duplicate push fail loudly.
- Commit (match this repo's commit style)
- Open PR with "Closes #<n>" in the body
- Comment the issue with a 2-line summary
- Never merge. Never push to main. A human approves merges
  (`ralph-approved` on the PR, or the issue was pre-tagged `ralph-auto`).

## Loop hygiene — hard rules
- NEVER add/remove `ralph-*` labels and never touch `refs/heads/ralph/claim-*`,
  ralph/.lock, ralph/runs.jsonl, or ralph/logs/ — the harness owns those.
- If a `gh` call fails transiently (rate limit / 5xx / network), retry it up
  to 3 times with a short sleep; if it still fails, say so and stop — the
  harness records the attempt and will retry or park.
