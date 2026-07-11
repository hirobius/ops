#!/usr/bin/env bash
# ralph/run.sh — ONE hardened Ralph iteration (select → claim → work →
# reconcile), safe to run repeatedly and unattended.
#
# EXIT-CODE CONTRACT (loop.sh keys on these; codes only, never stdout):
#   0  success — a PR exists for the worked issue
#   10 queue empty — no eligible ralph-ready issues
#   11 concurrent runner — lock held, CI run active, or lost 3 claim races
#   12 parked — this iteration parked its task (malformed / attempt cap /
#      PR creation exhausted); more queue may remain
#   13 blocked — an open ralph/* PR is awaiting review/merge (wedge-classified
#      and alerted if stuck); single-flight forbids starting another task
#   20 iteration error — claude failed/timed out, or GitHub API retries
#      exhausted (never masquerades as "queue empty")
#
# Every run appends one JSONL line to ralph/runs.jsonl (task, decision,
# result, exit reason) and tees the full claude transcript to ralph/logs/ —
# runs are auditable after the fact, nothing dies silently.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=ralph/lib.sh
. ralph/lib.sh

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
ISSUE="" DECISION="" RESULT="" EXIT_REASON="" STASH_REF="" CLAIMED=0

finish() { # single exit door: audit line + recap, then the contract code
  local code=$1
  trap - ERR EXIT
  audit "$RUN_ID" "${ISSUE:-none}" "${DECISION:-none}" "${RESULT:-none}" \
    "${EXIT_REASON:-exit-$code}" "$STASH_REF"
  if [ "$RALPH_DRY_RUN" != "1" ] && [ -n "$ISSUE" ]; then
    local outcome=no-op
    [ "$code" -eq 0 ] && outcome=shipped
    { [ "$code" -eq 12 ] || [ "$code" -eq 20 ]; } && outcome=blocked
    node scripts/log-run.mjs --actor ralph --outcome "$outcome" \
      --task "#$ISSUE" \
      --summary "ralph run $RUN_ID: ${RESULT:-${EXIT_REASON:-exit $code}}" \
      >/dev/null 2>&1 || true
  fi
  exit "$code"
}

on_err() { # any unhandled failure maps to 20, never a random code
  local line=$1
  EXIT_REASON="${EXIT_REASON:-unhandled error at run.sh:$line}"
  [ "$CLAIMED" = "1" ] && release_claim "$ISSUE"
  finish 20
}
trap 'on_err $LINENO' ERR
trap 'EXIT_REASON="${EXIT_REASON:-interrupted}"; [ "$CLAIMED" = "1" ] && release_claim "$ISSUE"; finish 20' INT TERM

# ── 1. One runner per repo ──────────────────────────────────────────────────
# flock (Linux) is belt-and-suspenders for same-machine double-invokes; the
# claim ref remains the real cross-runner guard. macOS has no flock — degrade
# with a warning rather than dying.
if command -v flock >/dev/null 2>&1; then
  exec 9>ralph/.lock
  if ! flock -n 9; then
    DECISION=skip EXIT_REASON="flock held — another local runner is active"
    finish 11
  fi
else
  echo "ralph: flock not available (macOS?) — relying on claim refs alone" >&2
fi
if [ -z "${GITHUB_ACTIONS:-}" ]; then
  ci_active=$( (gh run list --workflow ralph.yml --status in_progress --json databaseId --jq length 2>/dev/null || echo 0) )
  ci_queued=$( (gh run list --workflow ralph.yml --status queued --json databaseId --jq length 2>/dev/null || echo 0) )
  if [ "$((${ci_active:-0} + ${ci_queued:-0}))" -gt 0 ]; then
    DECISION=skip EXIT_REASON="a ralph.yml CI run is active/queued — it drives this repo right now"
    finish 11
  fi
fi

# ── 2. Single-flight + wedge check ──────────────────────────────────────────
prs=$(gh_retry pr list --state open --json number,headRefName,headRefOid,updatedAt \
  --jq '[.[] | select(.headRefName | startswith("ralph/")) | select(.headRefName | startswith("ralph/claim-") | not)]') ||
  { EXIT_REASON="gh pr list failed after retries"; finish 20; }
if [ "$(jq length <<<"$prs")" -gt 0 ]; then
  wedged=$(classify_wedged <<<"$prs")
  if [ -n "$wedged" ]; then
    echo "ralph: loop is WEDGED behind stuck PR(s):"
    echo "$wedged"
    notify_discord "🟠 **Ralph loop WEDGED** on \`$(repo_slug)\` — open Ralph PR(s) will not merge:
$wedged
Clear them (address the review, rebase, or close) to resume."
    DECISION=skip EXIT_REASON="wedged behind stuck ralph PR(s)"
  else
    echo "ralph: a healthy Ralph PR is in flight — single-flight, not starting another task."
    DECISION=skip EXIT_REASON="healthy ralph PR in flight"
  fi
  finish 13
fi

# ── 3. Clean baseline ───────────────────────────────────────────────────────
if [ "$RALPH_DRY_RUN" != "1" ]; then
  git rebase --abort >/dev/null 2>&1 || true
  git merge --abort >/dev/null 2>&1 || true
  git cherry-pick --abort >/dev/null 2>&1 || true
  if [ -n "$(git status --porcelain)" ]; then
    STASH_REF="ralph-salvage-$RUN_ID"
    git stash push -u -m "$STASH_REF" >/dev/null
    echo "ralph: dirty tree salvaged to stash '$STASH_REF' (git stash list to recover)"
  fi
  DEFAULT_BRANCH=$(default_branch)
  git checkout -q "$DEFAULT_BRANCH"
  git fetch -q origin "$DEFAULT_BRANCH"
  git reset -q --hard "origin/$DEFAULT_BRANCH"
  prune_merged_ralph_branches
  touch progress.txt
fi

# ── 4. Select + claim (atomic; lost race → next candidate) ──────────────────
races=0
while :; do
  sel=0
  ISSUE=$(bash ralph/next.sh) || sel=$? # ||-guarded: exit 10/20 must not trip the ERR trap
  if [ "$sel" -eq 0 ] && ! [[ "$ISSUE" =~ ^[0-9]+$ ]]; then
    # selector stdout must be exactly one issue number — anything else means
    # a helper leaked output; fail loud rather than claim garbage
    echo "ralph: selector emitted non-numeric output: '$ISSUE'" >&2
    sel=20
  fi
  case $sel in
  0) ;;
  10)
    ISSUE="" DECISION=none EXIT_REASON="queue empty"
    finish 10
    ;;
  *)
    ISSUE="" DECISION=none EXIT_REASON="selector failed (gh API exhausted)"
    finish 20
    ;;
  esac
  if claim_issue "$ISSUE" "$RUN_ID"; then
    CLAIMED=1
    break
  fi
  races=$((races + 1))
  echo "ralph: lost the claim race on #$ISSUE ($races/3)"
  if [ "$races" -ge 3 ]; then
    DECISION=skip EXIT_REASON="lost 3 claim races — another runner is draining the queue"
    finish 11
  fi
done
DECISION="work #$ISSUE"
echo "ralph: claimed #$ISSUE (run $RUN_ID)"

if [ "$RALPH_DRY_RUN" = "1" ]; then
  RESULT="dry-run: would work #$ISSUE" EXIT_REASON="dry-run"
  finish 0
fi

# ── 5. Work — bounded, streamed, non-fatal ──────────────────────────────────
mkdir -p ralph/logs
LOGFILE="ralph/logs/${RUN_ID}-issue-${ISSUE}.log"
# ||-guarded so a claude failure/timeout reaches reconciliation instead of the
# ERR trap; with pipefail the captured code is claude's/timeout's, not tee's.
work_code=0
timeout -k 30 "$RALPH_ITER_TIMEOUT" \
  claude --permission-mode acceptEdits -p "@ralph/prompt.md @AGENTS.md @progress.txt

ISSUE=$ISSUE — work exactly this issue. Do ONE iteration only, then stop." 2>&1 |
  tee "$LOGFILE" || work_code=$?
work_status="claude exit $work_code"
[ "$work_code" -eq 124 ] && work_status="timed out after ${RALPH_ITER_TIMEOUT}s"
echo "ralph: work step finished ($work_status) — reconciling actual state"

# ── 6. Reconcile — state decides, not the exit code ─────────────────────────
outcome=$(reconcile_issue "$ISSUE" "$RUN_ID" "$work_status")
CLAIMED=0 # reconcile_issue released the claim on every path
case $outcome in
pr:*)
  RESULT="PR ${outcome#pr:} for #$ISSUE" EXIT_REASON="shipped"
  echo "ralph: ✅ $RESULT"
  finish 0
  ;;
parked:*)
  RESULT="parked #$ISSUE" EXIT_REASON="${outcome#parked:}"
  echo "ralph: 🅿️ parked #$ISSUE — ${outcome#parked:}"
  finish 12
  ;;
*)
  RESULT="no ship for #$ISSUE" EXIT_REASON="${outcome#failed:}"
  echo "ralph: ❌ iteration failed — ${outcome#failed:} (transcript: $LOGFILE)"
  finish 20
  ;;
esac
