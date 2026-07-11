# Ralph — the autonomous issue→PR loop

Deterministic, auditable, human-approved. GitHub **is** the state store:
`ralph-ready` label = queue · claim refs = locks · branches/PRs = work product
· comments = audit trail. All state changes go through `gh` — nothing else.

## Run it AFK (safely)

1. `bash ralph/loop.sh 10` — up to 10 iterations; stops by itself when the
   queue drains, another runner is active, or errors repeat.
2. Everything is audited: `ralph/runs.jsonl` (one JSON line per iteration) +
   full transcripts in `ralph/logs/`. Health check: `bash ralph/status.sh`.
3. Merges need a human: label the PR `ralph-approved` — or **batch-approve**
   by tagging issues `ralph-auto` alongside `ralph-ready` before you walk away.
4. Ctrl-C is always safe; state lives in GitHub and the next run reconciles.
5. Knobs live in `ralph/config.env` (timeout, attempt cap, PR wait).

## Exit codes (run.sh → loop.sh / your scripts)

`0` shipped a PR · `10` queue empty · `11` another runner owns the repo ·
`12` task parked (with a written reason on the issue) · `13` blocked on an
open Ralph PR (wedge-classified; stuck ones alert Discord) · `20` iteration
error (bounded backoff, never silent).

## Labels

| Label | Who sets it | Meaning |
|---|---|---|
| `ralph-ready` | human | queued for the loop (the governor) |
| `p0`–`p3` | human | priority; selector sorts p0→p3 then issue # |
| `ralph-auto` | human | batch pre-approval: PR auto-merges after gate + AI review |
| `ralph-approved` | human | per-PR approval: arms auto-merge |
| `ralph-wip` | loop | claimed, in progress (claim ref is the real lock) |
| `ralph-parked` | loop | gave up with a reason — re-add `ralph-ready` to retry |
| `needs-adrian` | loop | malformed/blocked on a human (e.g. no acceptance criteria) |
| `ralph-selfheal-attempted` | gate | the one bounded self-heal was spent on this PR |

## Add Ralph to another hirobius repo

1. **Vendor this directory** into the repo (from a local ops checkout):
   `cp -r ../ops/ralph . && rm -rf ralph/logs ralph/runs.jsonl ralph/.lock`
   Then edit the two per-repo files: `ralph/gate.sh` (the repo's own
   typecheck/test/lint steps) and `ralph/config.env` (knobs).
2. **Add the two thin callers** as `.github/workflows/ralph.yml` and
   `.github/workflows/ralph-gate.yml` — copy them from ops and change the
   `uses:` lines to the org-level form:
   `uses: hirobius/ops/.github/workflows/ralph-run-reusable.yml@main` and
   `uses: hirobius/ops/.github/workflows/ralph-gate-reusable.yml@main`.
3. **One-time org setup** (already done once, listed for completeness):
   - Org secrets `CLAUDE_CODE_OAUTH_TOKEN` + `DISCORD_WEBHOOK_URL`, shared
     with private repos: <https://github.com/organizations/hirobius/settings/secrets/actions>
   - Allow org repos to call ops' reusable workflows:
     <https://github.com/hirobius/ops/settings/actions> → **Access** →
     "Accessible from repositories in the `hirobius` organization".
4. **Per-repo GitHub settings**: branch protection on the default branch with
   required status check `ralph-gate` + "Allow auto-merge" enabled:
   `https://github.com/hirobius/<repo>/settings/branches`
5. Add a "Ralph quality bar" section to the repo's `AGENTS.md` (REPO_TYPE,
   quality bar, rules — copy ops' section as the template), file issues with
   acceptance criteria, tag them `ralph-ready` (+ `p0`–`p3`, + `ralph-auto`
   if pre-approved), and either let CI chain or run `bash ralph/loop.sh N`.

## Layout

- `lib.sh` — shared plumbing: atomic claims, parking, reconcile, wedge
  classification, retries, audit log (also callable: `bash ralph/lib.sh <fn>`)
- `next.sh` — deterministic selector (priority label, then issue #)
- `run.sh` — one hardened iteration (the exit-code contract lives here)
- `loop.sh` — AFK driver over run.sh exit codes
- `gate.sh` — **per-repo** red/green gate; red = no PR, fail closed
- `config.env` — **per-repo** knobs
- `status.sh` — read-only "is it stuck?" snapshot
- `prompt.md` — the one-iteration instructions the model gets
