#!/usr/bin/env bash
# shellcheck shell=bash
# ralph/lib.sh — shared plumbing for the Ralph loop (sourced by next.sh,
# run.sh, loop.sh, status.sh; executable as `bash ralph/lib.sh <fn> [args]`
# so workflows can call single helpers).
#
# Contract: ALL loop state lives in GitHub and is mutated ONLY through gh —
# labels (queue/park), comments (claims + attempt counts, the audit trail),
# claim refs (refs/heads/ralph/claim-<n>, the atomic lock), branches and PRs
# (the work product). No other state store.
#
# Repo-agnostic: the repo is derived from `git remote get-url origin`, knobs
# from ralph/config.env (env vars win), so any hirobius repo can vendor this
# directory unchanged — only gate.sh and config.env are per-repo.

RALPH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Per-repo knobs (checked in); real env overrides the file so CI can tune.
if [ -f "$RALPH_DIR/config.env" ]; then
  while IFS='=' read -r k v; do
    case "$k" in '' | \#*) continue ;; esac
    [ -z "${!k:-}" ] && export "$k=$v"
  done <"$RALPH_DIR/config.env"
fi
: "${RALPH_ITER_TIMEOUT:=3600}"                       # seconds one claude iteration may run
: "${RALPH_MAX_ATTEMPTS:=2}"                          # failed attempts before parking
: "${RALPH_PR_WAIT:=1800}"                            # seconds loop.sh waits on an open PR
: "${RALPH_CLAIM_TTL:=$((RALPH_ITER_TIMEOUT * 2))}"   # claim older than this w/o a PR = stale
: "${RALPH_READY_LABEL:=ralph-ready}"
: "${RALPH_AUTO_MERGE_LABEL:=ralph-auto}"
: "${RALPH_APPROVE_LABEL:=ralph-approved}"
: "${RALPH_DRY_RUN:=0}"

repo_slug() {
  # CI first: $GITHUB_REPOSITORY is the runner's canonical slug. The checkout's
  # origin URL is NOT trustworthy mid-job — claude-code-action rewrites it to
  # https://x-access-token:<token>@github.com/..., which the sed below didn't
  # strip, so every "repos/$(repo_slug)/..." API path built after the model
  # step 404'd SILENTLY (ralph#8: claim refs never released, attempt-budget
  # resets never seen). The local fallback also strips embedded credentials.
  if [ -n "${GITHUB_REPOSITORY:-}" ]; then
    echo "$GITHUB_REPOSITORY"
    return 0
  fi
  git remote get-url origin | sed -E 's#^(git@github\.com:|https://([^@/]+@)?github\.com/)##; s#\.git$##'
}

default_branch() {
  git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || echo main
}

# GNU date first, BSD date fallback (Adrian runs the loop on macOS too).
epoch_of() {
  date -u -d "$1" +%s 2>/dev/null || date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$1" +%s
}

iso_of() { # epoch seconds → ISO-8601 Zulu (GNU first, BSD fallback)
  date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -r "$1" +%Y-%m-%dT%H:%M:%SZ
}

# Bounded retry for transient gh failures (rate limit, 5xx, network).
# NOT for calls whose failure is meaningful (claim-ref create must see 422).
gh_retry() {
  local attempt delay
  for attempt in 1 2 3; do
    if gh "$@"; then return 0; fi
    delay=$((2 ** attempt))
    echo "ralph: gh $1 failed (attempt $attempt/3) — retrying in ${delay}s" >&2
    sleep "$delay"
  done
  echo "ralph: gh $1 failed after 3 attempts" >&2
  return 1
}

notify_discord() {
  if [ -z "${DISCORD_WEBHOOK_URL:-}" ]; then
    echo "ralph: (no DISCORD_WEBHOOK_URL — not pinging) $*" >&2
    return 0
  fi
  curl -sS -H "Content-Type: application/json" \
    -d "$(jq -n --arg c "$*" '{content:$c}')" \
    "$DISCORD_WEBHOOK_URL" >/dev/null || echo "ralph: Discord notify failed (non-fatal)" >&2
}

# audit <run_id> <issue> <decision> <result> <exit_reason> [stash_ref]
# One JSONL line per iteration into ralph/runs.jsonl (gitignored, last 200 kept)
# — the after-the-fact record of what every run decided and why it exited.
audit() {
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  jq -cn --arg ts "$ts" --arg run "$1" --arg issue "$2" --arg decision "$3" \
    --arg result "$4" --arg reason "$5" --arg stash "${6:-}" \
    '{ts:$ts, run_id:$run, issue:$issue, decision:$decision, result:$result,
      exit_reason:$reason} + (if $stash != "" then {stash_ref:$stash} else {} end)' \
    >>"$RALPH_DIR/runs.jsonl"
  tail -n 200 "$RALPH_DIR/runs.jsonl" >"$RALPH_DIR/runs.jsonl.tmp" &&
    mv "$RALPH_DIR/runs.jsonl.tmp" "$RALPH_DIR/runs.jsonl"
}

# ---------------------------------------------------------------- PR health

open_ralph_prs() {
  gh pr list --state open --json number,headRefName,headRefOid,updatedAt \
    --jq '[.[] | select(.headRefName | startswith("ralph/")) |
           select(.headRefName | startswith("ralph/claim-") | not)]'
}

# classify_wedged  (stdin: open_ralph_prs JSON)
# Prints "- #N — reason" per WEDGED PR (failed ralph-gate, or ≥3h with no
# passing gate); prints nothing when every open Ralph PR is healthy in-flight.
classify_wedged() {
  local prs now n sha updated gate age_h
  prs=$(cat)
  now=$(date -u +%s)
  while read -r n sha updated; do
    [ -z "$n" ] && continue
    gate=$(gh api "repos/$(repo_slug)/commits/$sha/status" \
      --jq '[.statuses[] | select(.context=="ralph-gate")] | sort_by(.created_at) | (last.state // "none")' \
      2>/dev/null || echo none)
    age_h=$(((now - $(epoch_of "$updated")) / 3600))
    if [ "$gate" = "failure" ]; then
      echo "- #$n — ralph-gate FAILED (changes requested / red gate); needs a human."
    elif { [ "$gate" = "none" ] || [ "$gate" = "pending" ]; } && [ "$age_h" -ge 3 ]; then
      echo "- #$n — open ${age_h}h with no passing ralph-gate (stale / never gated)."
    fi
  done < <(jq -r '.[] | "\(.number) \(.headRefOid) \(.updatedAt)"' <<<"$prs")
}

# ------------------------------------------------------------------- claims

claim_ref_exists() {
  git ls-remote --exit-code origin "refs/heads/ralph/claim-$1" >/dev/null 2>&1
}

delete_claim_ref() {
  gh api -X DELETE "repos/$(repo_slug)/git/refs/heads/ralph/claim-$1" >/dev/null 2>&1
}

# A claim is stale when there is no open PR for the issue's branch AND its
# newest claim comment (or none at all — claimer died before commenting) is
# older than RALPH_CLAIM_TTL. Stale claims are reclaimable; a killed run can
# never deadlock the queue.
claim_is_stale() {
  local n=$1 open last now age
  open=$(gh pr list --state open --json headRefName \
    --jq "[.[] | select(.headRefName | startswith(\"ralph/issue-$n-\"))] | length" \
    2>/dev/null || echo 0)
  [ "${open:-0}" -gt 0 ] && return 1
  last=$(gh issue view "$n" --json comments \
    --jq '[.comments[] | select(.body | startswith("ralph-claim"))] | (last.createdAt // empty)' \
    2>/dev/null || true)
  [ -z "$last" ] && return 0
  now=$(date -u +%s)
  age=$((now - $(epoch_of "$last")))
  [ "$age" -ge "$RALPH_CLAIM_TTL" ]
}

ensure_label() { # ensure_label <name> <color> <description>
  gh label create "$1" --color "$2" --description "$3" >/dev/null 2>&1 || true
}

# claim_issue <n> <run_id> — atomic test-and-set: creating the claim ref
# succeeds for exactly one caller (GitHub rejects an existing ref with 422),
# so two iterations can never win the same issue. Re-claiming an issue whose
# ref you already hold is handled by the caller keeping its run_id — the
# comment trail makes ownership visible. Returns 1 on a lost race.
claim_issue() {
  local n=$1 run_id=$2 sha ok
  if [ "$RALPH_DRY_RUN" = "1" ]; then
    echo "ralph[dry-run]: would claim #$n" >&2
    return 0
  fi
  if claim_ref_exists "$n"; then
    if claim_is_stale "$n"; then
      echo "ralph: claim on #$n is stale — reclaiming" >&2
      delete_claim_ref "$n" || return 1
    else
      return 1
    fi
  fi
  sha=$(git rev-parse HEAD)
  gh api -X POST "repos/$(repo_slug)/git/refs" \
    -f ref="refs/heads/ralph/claim-$n" -f sha="$sha" >/dev/null 2>&1 || return 1
  ensure_label ralph-wip FBCA04 "Ralph is working this issue right now"
  gh issue edit "$n" --add-label ralph-wip >/dev/null 2>&1 || true
  gh issue comment "$n" --body "ralph-claim $run_id" >/dev/null 2>&1 || true
  # The claim only counts if the issue is still open and still queued —
  # otherwise it was closed/retracted between select and claim.
  # Pipe to real jq: gh's --jq takes only an expression, it has NO --arg flag
  # (using one makes gh error and every re-verify silently fail — bit us live).
  ok=$(gh issue view "$n" --json state,labels 2>/dev/null |
    jq -r --arg l "$RALPH_READY_LABEL" \
      'if .state == "OPEN" and ([.labels[].name] | index($l) != null) then "yes" else "no" end' \
      2>/dev/null || echo no)
  if [ "$ok" != "yes" ]; then
    echo "ralph: #$n was closed or unqueued between select and claim — releasing" >&2
    release_claim "$n"
    return 1
  fi
  return 0
}

release_claim() {
  local n=$1
  [ "$RALPH_DRY_RUN" = "1" ] && return 0
  # Fail loud (stderr, non-fatal): a leaked claim ref blocks re-queueing the
  # issue until the stale-TTL reclaim — never let that happen silently again.
  delete_claim_ref "$n" ||
    echo "ralph: WARNING — could not delete claim ref for #$n; it will block re-claims until the stale-TTL reclaim." >&2
  gh issue edit "$n" --remove-label ralph-wip >/dev/null 2>&1 || true
}

# ------------------------------------------------------- attempts + parking

# Newest `ralph-ready` labeled event — the shared reset boundary: re-adding the
# label deliberately restarts BOTH the attempt budget and next.sh's PR-history
# guard, so a re-queued parked issue never instantly re-parks at the cap and a
# prior cycle's signals never leak into this one. Only failures/PRs newer than
# this timestamp count (ISO-8601 Zulu strings compare correctly as text). Prints
# the timestamp, empty when no such event exists, or the literal `unknown` when
# the API call itself failed — callers fail closed on `unknown` (skip/fail, never
# park) rather than counting from epoch (the old fail-open bit us past the cap).
latest_ready_label_at() {
  local n=$1 events
  events=$(gh api "repos/$(repo_slug)/issues/$n/events" --paginate 2>/dev/null) || {
    echo unknown
    return 0
  }
  jq -rs --arg l "$RALPH_READY_LABEL" \
    '[add[] | select(.event == "labeled" and .label.name == $l)] | (last.created_at // empty)' \
    <<<"$events" 2>/dev/null || echo unknown
}

# count_failed_attempts <n> [since] — failures NEWER than the latest ralph-ready
# labeled event. No event → count everything (conservative). Prints the literal
# `unknown` when the boundary or the comment fetch is unavailable, so a
# transient API flake can never re-select a should-be-parked issue (the old
# `|| echo 0` fail-open did exactly that); callers must skip/fail, never park.
count_failed_attempts() {
  local n=$1 since=${2:-} comments
  [ -z "$since" ] && since=$(latest_ready_label_at "$n")
  [ "$since" = "unknown" ] && {
    echo unknown
    return 0
  }
  comments=$(gh issue view "$n" --json comments 2>/dev/null) || {
    echo unknown
    return 0
  }
  jq -r --arg since "${since:-1970-01-01T00:00:00Z}" \
    '[.comments[] | select((.body | startswith("ralph-attempt-failed")) and (.createdAt > $since))] | length' \
    <<<"$comments" 2>/dev/null || echo unknown
}

# Did the model post a `ralph-blocked` sentinel THIS cycle? That comment is the
# model's explicit "I followed the blocked/ambiguous → comment and STOP
# contract; this is a clean hand-off to a human, not a crashed attempt" signal
# (prompt.md §1). Gated by latest_ready_label_at so a stale sentinel from a
# prior cycle can't suppress a genuine failure after a re-queue. An unknowable
# boundary (events API down) → treat as unsignalled, so the conservative
# attempt path runs rather than a possibly-stale sentinel suppressing a failure.
model_signalled_blocked() {
  local n=$1 since count
  since=$(latest_ready_label_at "$n")
  [ "$since" = "unknown" ] && return 1
  count=$(gh issue view "$n" --json comments 2>/dev/null |
    jq -r --arg since "${since:-1970-01-01T00:00:00Z}" \
      '[.comments[] | select((.body | ascii_downcase | startswith("ralph-blocked")) and (.createdAt > $since))] | length' \
      2>/dev/null || echo 0)
  [ "${count:-0}" -gt 0 ]
}

record_failed_attempt() { # <n> <run_id> <reason>
  [ "$RALPH_DRY_RUN" = "1" ] && return 0
  gh issue comment "$1" --body "ralph-attempt-failed $2 — $3" >/dev/null 2>&1 || true
}

# park_issue <n> <reason> <label: ralph-parked|needs-adrian>
# Parking = out of the queue WITH a written reason — never a silent drop,
# never a false "done". Reversible: re-add the ready label to retry.
park_issue() {
  local n=$1 reason=$2 label=$3
  if [ "$RALPH_DRY_RUN" = "1" ]; then
    echo "ralph[dry-run]: would park #$n ($label): $reason" >&2
    return 0
  fi
  ensure_label ralph-parked D93F0B "Parked by the Ralph loop — see the park comment"
  ensure_label needs-adrian 5319E7 "Blocked on a human decision"
  # >/dev/null matters: gh edit/comment print URLs on stdout, and park_issue
  # runs inside next.sh's candidate walk — stray stdout would corrupt the
  # selected-issue capture in run.sh / the CI guard (bit us on the first run).
  gh_retry issue edit "$n" --remove-label "$RALPH_READY_LABEL" --add-label "$label" >/dev/null || true
  gh_retry issue comment "$n" --body "🅿️ **Ralph parked this issue** — $reason
(To retry: fix the cause, then re-add \`$RALPH_READY_LABEL\`.)" >/dev/null || true
}

# ---------------------------------------------------------------- reconcile

# run_claim_time <n> <run_id> — the start-of-run boundary: the server-side
# created_at of THIS run's `ralph-claim <run_id>` comment (posted by
# claim_issue), so runner clock skew can't move it. The comment's post is
# ||-guarded and can be missing — fall back to the widest window this run
# could possibly have spanned.
run_claim_time() {
  local n=$1 run_id=$2 t
  t=$(gh api "repos/$(repo_slug)/issues/$n/comments" --paginate 2>/dev/null |
    jq -rs --arg b "ralph-claim $run_id" \
      '[add[] | select(.body == $b)] | (last.created_at // empty)' 2>/dev/null || true)
  if [ -n "$t" ]; then
    echo "$t"
    return 0
  fi
  iso_of "$(($(date -u +%s) - RALPH_ITER_TIMEOUT - 600))"
}

# reconcile_issue <n> <run_id> <work_status>
# State-based post-iteration reconciliation — the single place that decides
# what actually happened, regardless of how the work step died. Prints one
# token: pr:<num> | parked:<why> | failed:<why>. Never returns non-zero.
reconcile_issue() {
  local n=$1 run_id=$2 work_status=$3 all since pr closed branch i fails why eligible
  all=$(gh pr list --state all --limit 200 --json number,headRefName,state,createdAt \
    --jq "[.[] | select(.headRefName | startswith(\"ralph/issue-$n-\"))]" \
    2>/dev/null || echo '[]')
  # PRs from PAST runs must never count as THIS run's shipment: hds#126 looped
  # forever because two long-merged PRs made every no-op iteration reconcile
  # as "success" — no attempt recorded, never parked, reselected every tick.
  # 60s allowance for the gap between ref-create and claim-comment post.
  since=$(iso_of "$(($(epoch_of "$(run_claim_time "$n" "$run_id")") - 60))")
  # 1) An OPEN PR (any age — in-flight work; single-flight holds the loop) or
  #    a PR merged DURING this run → success. A CLOSED one was rejected by a
  #    human — it must never count as shipped, and its branch is never
  #    resurrected.
  pr=$(jq -r --arg s "$since" \
    '[.[] | select(.state == "OPEN" or (.state == "MERGED" and .createdAt >= $s))] | (first.number // empty)' <<<"$all")
  if [ -n "$pr" ]; then
    release_claim "$n"
    echo "pr:$pr"
    return 0
  fi
  closed=$(jq -r '[.[] | select(.state == "CLOSED")] | length' <<<"$all")
  # 2) Branch pushed but no PR (the PR step failed / response was lost) →
  #    open it ourselves, bounded retry with backoff. Never when a CLOSED PR
  #    exists — that would resurrect human-rejected work (parked in 4 below).
  branch=""
  if [ "${closed:-0}" -eq 0 ]; then
    branch=$(git ls-remote --heads origin "ralph/issue-$n-*" 2>/dev/null |
      awk '{print $2}' | sed 's#refs/heads/##')
    if [ "$(grep -c . <<<"$branch")" -gt 1 ]; then
      echo "ralph: WARNING — multiple ralph/issue-$n-* branches exist; recovering the first" >&2
    fi
    branch=$(head -n1 <<<"$branch")
  fi
  if [ -n "$branch" ]; then
    if [ "$RALPH_DRY_RUN" = "1" ]; then
      echo "pr:dry-run"
      return 0
    fi
    for i in 1 2 3; do
      if gh pr create --head "$branch" --base "$(default_branch)" \
        --title "$(git log -1 --format=%s "origin/$branch" 2>/dev/null || echo "ralph: issue #$n")" \
        --body "Closes #$n

Opened by ralph reconciliation (run \`$run_id\`): the iteration pushed this branch but its PR step failed." \
        >/dev/null 2>&1; then
        release_claim "$n"
        echo "pr:recovered"
        return 0
      fi
      sleep $((2 ** i))
    done
    why="branch $branch pushed but PR creation failed after 3 attempts (auth/network?)"
  else
    why="iteration ended without a pushed branch ($work_status)"
  fi
  # 3) Deliberate stop vs genuine failure. "No branch pushed" is ambiguous: the
  #    model may have crashed/timed out (a real failed attempt → retry), OR it
  #    followed prompt.md §1 ("blocked/ambiguous → comment and STOP") and pushed
  #    nothing ON PURPOSE because the issue needs a human. Burning an attempt on
  #    the latter double-counts one decision and wastes the retry on an
  #    already-known blocker (site-engine#86: a schema-drift blocker cost an
  #    attempt and reddened the run, halting the chain). Distinguish via the
  #    model's own signals, each gated to THIS cycle so a re-queue resets them:
  #      (a) a `ralph-blocked` comment it posted — the PRIMARY signal, because
  #          §1 makes it always comment when it stops (a label add is optional
  #          and a cautious model may skip it), or
  #      (b) the issue left the ready queue mid-run — closed, ready label
  #          pulled, or needs-adrian/blocked added (by the model or a human).
  #    Either routes to a human (needs-adrian) GREEN with no attempt recorded.
  #    On a gh API failure eligibility defaults to "queued" and the sentinel to
  #    absent → conservative fall-through to the attempt path, never a silent
  #    swallow.
  eligible=$(gh issue view "$n" --json state,labels 2>/dev/null |
    jq -r --arg l "$RALPH_READY_LABEL" \
      'if .state != "OPEN" then "closed"
       elif ([.labels[].name] | index($l)) == null then "unqueued"
       elif ([.labels[].name] | (index("needs-adrian") or index("blocked"))) then "handed-off"
       else "queued" end' 2>/dev/null || echo queued)
  # A dead `gh issue view` leaves jq with empty input → empty string, which
  # must read as "queued" (conservative), never as a deliberate stop.
  [ -z "$eligible" ] && eligible=queued
  if [ "$eligible" != "queued" ]; then
    release_claim "$n"
    echo "parked:#$n left the ready queue mid-iteration ($eligible) — deliberate stop, no attempt recorded ($why)"
    return 0
  fi
  # 4) Model signalled a deliberate blocked-stop THIS cycle (`ralph-blocked`
  #    comment) but left labels alone (loop hygiene: the harness owns queue
  #    labels). Route to needs-adrian without counting an attempt — the exact
  #    class that reddened the run and halted the chain in site-engine#86.
  if model_signalled_blocked "$n"; then
    park_issue "$n" "the model signalled it is blocked on a human decision (\`ralph-blocked\`) and stopped without a PR — $why" needs-adrian
    release_claim "$n"
    echo "parked:#$n — model signalled \`ralph-blocked\` (routed to needs-adrian), no attempt recorded"
    return 0
  fi
  # 5) A human closed Ralph PR(s) for this issue → a rejection needs direction,
  #    not a retry that re-proposes the same rejected change.
  if [ "${closed:-0}" -gt 0 ]; then
    release_claim "$n"
    park_issue "$n" "Ralph PR(s) for this issue were closed without merging — a human rejection needs direction, not a retry. Decide the path, then re-add \`$RALPH_READY_LABEL\`." needs-adrian
    echo "parked:human-closed Ralph PR(s) exist for #$n — needs direction, not a retry"
    return 0
  fi
  # 6) Nothing new this run but PR(s) from PAST runs already merged → the
  #    remainder of the issue is evidently not agent-actionable (hds#126:
  #    merged work + human-only DoD items kept the issue open and looping).
  if jq -e --arg s "$since" \
    '[.[] | select(.state == "MERGED" and .createdAt < $s)] | length > 0' <<<"$all" >/dev/null; then
    release_claim "$n"
    park_issue "$n" "prior Ralph PR(s) merged but the issue is still open and this iteration produced nothing new — the remainder looks not agent-actionable. Close the issue or split what's left into a new issue, then re-add \`$RALPH_READY_LABEL\`." needs-adrian
    echo "parked:prior merged PR(s) but issue still open — remainder not agent-actionable"
    return 0
  fi
  # 7) Genuine no-ship → record the attempt, release the claim, park on cap.
  #    An `unknown` count (API blindness) fails WITHOUT parking — next.sh
  #    re-checks the budget fail-closed before ever re-offering the issue.
  record_failed_attempt "$n" "$run_id" "$why"
  release_claim "$n"
  fails=$(count_failed_attempts "$n")
  if [ "$fails" = "unknown" ]; then
    echo "failed:$why (attempt budget unverifiable — API failure; selection re-checks fail-closed)"
  elif [ "${fails:-0}" -ge "$RALPH_MAX_ATTEMPTS" ]; then
    park_issue "$n" "gave up after $fails failed attempt(s) — last: $why" ralph-parked
    echo "parked:$why"
  else
    echo "failed:$why (attempt $fails/$RALPH_MAX_ATTEMPTS)"
  fi
  return 0
}

# Delete local ralph/* branches whose PR is merged or closed. Branches with
# an OPEN PR or with NO PR at all are kept — the latter are forensics from a
# failed attempt (committed but never shipped), never destroy them here.
prune_merged_ralph_branches() {
  local b state
  while read -r b; do
    [ -z "$b" ] && continue
    state=$(gh pr view "$b" --json state --jq .state 2>/dev/null || echo NONE)
    case "$state" in
      MERGED | CLOSED) git branch -D "$b" >/dev/null 2>&1 &&
        echo "ralph: pruned local branch $b (PR $state)" ;;
      *) : ;;
    esac
  done < <(git for-each-ref --format='%(refname:short)' refs/heads/ralph/ |
    grep -v '^ralph/claim-' || true)
}

# Executed directly (`bash ralph/lib.sh <fn> [args]`) → dispatch one helper,
# so workflows reuse the exact same logic as the local scripts.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  "$@"
fi
