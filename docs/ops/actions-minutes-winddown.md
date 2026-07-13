# Actions-minutes wind-down (2026-07-13)

Adrian's call: the monthly GitHub Actions minutes budget is nearly exhausted.
This session braked the automated burn, wrapped in-flight work, and set up the
self-hosted escape hatch. This doc is the record + the runbook to resume.

## What was burning

| Consumer | Trigger | Approx. cost |
|---|---|---|
| `ralph.yml` (ops + site-engine, hds too) | hourly cron tick + label + push-chain | ~1,400 min/mo in idle ticks alone; **each queue cycle ≈ 100+ min** (run job holds a runner for the whole Claude iteration, then the PR suite + gate + merge-push runs) |
| ops PR suite (9 workflows: a11y, ci, collision, perf, quality, responsive, visual, hds-migration-audit, ralph-gate) | every PR open/synchronize | ~40–60 job-min per PR event |
| `llm-daily-synthetic.yml` (ops) | daily 08:00 UTC | daily LLM run |
| `strengths-audit.yml` (ops) | weekly Mon 13:00 UTC | weekly |
| push-triggered (ci, quality, token-scan, notify-merge, sync-figma-variables) | every push to main | per merge |

With the 2026-07-11 "everything ralph-auto" decision, the loop chains
issue→PR→auto-merge→next-issue **fully unattended** — 22 issues were queued,
so left alone it would have burned ~2,000+ minutes overnight.

## The brake applied (this session, reversible)

1. **Queue drained**: `ralph-ready` removed from all 22 queued issues (every
   other label kept — `ralph-auto`, `p0–p3`, etc. — so re-queueing is a single
   label re-add). The chain's next hop / hourly tick now exits "queue empty"
   in ~1 min instead of starting a new 100-min cycle.
   - **ops (17):** #5 #30 #63 #68 #70 #71 #72 #73 #106 #107 #108 #109 #123 #139 #140 #158 #159
   - **site-engine (5):** #20 #86 #107 #108 #110
2. **In-flight run left to finish**: run [29216870881](https://github.com/hirobius/ops/actions/runs/29216870881)
   (ops#158, HDS Card rows) was 15 min into real work — killing it would waste
   that. Its PR will merge normally (issue carries `ralph-auto`); the chain hop
   after it finds an empty queue and stops. Cancel manually from that link if
   you'd rather stop immediately.
3. **NOT yet stopped — needs Adrian's clicks** (see below): the hourly ticks
   themselves, and the two scheduled ops workflows.

### Re-queue (when minutes reset or self-hosting is live)

```bash
for n in 5 30 63 68 70 71 72 73 106 107 108 109 123 139 140 158 159; do
  gh issue edit "$n" -R hirobius/ops --add-label ralph-ready; done
for n in 20 86 107 108 110; do
  gh issue edit "$n" -R hirobius/site-engine --add-label ralph-ready; done
```

(Re-adding the label fires the loop immediately — that's the designed restart;
concurrency dedups the stampede to one run per repo.)

## Adrian's click-list (in order)

1. **Disable the hourly loop workflows** (Actions UI → "⋯" → Disable workflow;
   with the queue empty they only cost ~1 min/hour each, but that's still
   ~720 min/mo/repo):
   - https://github.com/hirobius/ops/actions/workflows/ralph.yml
   - https://github.com/hirobius/site-engine/actions/workflows/ralph.yml
   - hds's `ralph.yml` too (outside this session's repo scope — same account pool)
   - Optional, smaller: https://github.com/hirobius/ops/actions/workflows/llm-daily-synthetic.yml
     and https://github.com/hirobius/ops/actions/workflows/strengths-audit.yml
   - Leave **ralph-gate.yml enabled** everywhere — it's the required merge
     check; disabling it strands every PR.
2. **Merge the engine's self-hosted-runner patch**: branch
   `claude/action-minutes-wrap-up-ny7p91` in hirobius/ralph
   (open the PR: https://github.com/hirobius/Ralph/pull/new/claude/action-minutes-wrap-up-ny7p91),
   then fast-forward the `v1` ref to the merge commit (backward-compatible per
   the versioning contract — same callers, same permissions, no new inputs):
   `git push origin <merged-sha>:v1 --force-with-lease` (v1 is currently a
   branch ref @ 043f956).
3. **site-engine PR #138** (verify-live module export, gate green since
   2026-07-12) is the one open fleet PR — label it `ralph-approved` or merge:
   https://github.com/hirobius/site-engine/pull/138

## Running Ralph on our own ecosystem

Two independent levers; both already work once the engine patch merges (lever 1
needs nothing at all):

### Lever 1 — local loop (zero Actions minutes, works today)

The kit was built for exactly this ("one logic for CI and local runs"). From a
checkout of any consumer repo, on any machine:

```bash
bash ralph/loop.sh 10        # up to 10 iterations; stops on empty queue
bash ralph/status.sh         # is it stuck?
```

Prereqs on the machine: `gh` authenticated (repo scope), the `claude` CLI
logged in (Max subscription — same `CLAUDE_CODE_OAUTH_TOKEN` identity CI
uses), `jq`, plus the repo's toolchain (pnpm) for `ralph/gate.sh`. GitHub
stays the state store, so local and CI runners coexist safely (claims are
atomic). Merges still flow through the `ralph-gate` required check in Actions —
that's the only remaining metered cost per PR (or use lever 2 for it).

### Lever 2 — self-hosted runner (Actions orchestration stays; minutes free)

Self-hosted runner minutes are unmetered on private repos. After the engine
patch merges (`v1` fast-forwarded):

1. Register a runner — org-level covers the whole fleet:
   https://github.com/organizations/hirobius/settings/actions/runners/new
   (any always-on box: old laptop, mini-PC, home server; needs Node,
   pnpm, `gh`, `jq`, git — and Playwright deps for the gate's layout tests).
2. Set the Actions **variable** `RALPH_RUNNER=self-hosted` — org-wide
   (https://github.com/organizations/hirobius/settings/variables/actions) or
   per repo. All three reusables read it for `runs-on`; unset = GitHub-hosted,
   unchanged.
3. **Safety rail:** attach the runner only to private repos / a runner group
   excluding public repos — never to the public hirobius/ralph repo itself
   (fork PRs could execute code on the box).

The ops per-PR suite (a11y/visual/perf/…) still runs GitHub-hosted — those 9
workflows are ops-local files; migrating them is the same one-line
`runs-on: ${{ vars.RALPH_RUNNER || 'ubuntu-latest' }}` edit per file if the
gate-only migration proves insufficient. Not done in this pass (deliberately
small blast radius).

### Recommended posture

Cheapest sustainable setup: **hourly loop workflows disabled + queue driven by
`bash ralph/loop.sh` on your own box + `RALPH_RUNNER=self-hosted` for the
gate**. GitHub-metered spend then rounds to ~zero, and the labels/claims/gate
governance is unchanged.
