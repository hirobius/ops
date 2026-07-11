#!/usr/bin/env bash
# ralph/loop.sh — AFK driver: up to N hardened iterations of ralph/run.sh.
#
# HOW TO RUN IT AFK SAFELY:
#   1. `bash ralph/loop.sh 10` — runs ≤10 iterations and stops by itself when
#      the queue drains, another runner is active, or errors repeat.
#   2. Every iteration is audited: ralph/runs.jsonl (one JSON line each) +
#      full transcripts in ralph/logs/. `bash ralph/status.sh` = live health.
#   3. Merges need a human: label the PR `ralph-approved` (or pre-tag issues
#      `ralph-auto` in batch) — the loop never merges on its own.
#   4. Ctrl-C is always safe — state lives in GitHub; the next run reconciles.
#   5. Tune knobs (timeout, attempts, PR wait) in ralph/config.env.
#
# Consumes run.sh EXIT CODES ONLY (see run.sh header) — never its stdout;
# capturing output is how the old loop managed to hang and die silently.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=ralph/lib.sh
. ralph/lib.sh

[ -z "${1:-}" ] && {
  echo "Usage: $0 <max-iterations>"
  exit 1
}
max=$1

# After a PR ships, poll until it merges/closes (the chain continues) or
# RALPH_PR_WAIT expires (normal stop when merges wait on `ralph-approved`).
wait_for_pr_resolution() {
  local waited=0 open
  while [ "$waited" -lt "$RALPH_PR_WAIT" ]; do
    open=$(gh pr list --state open --json headRefName \
      --jq '[.[] | select(.headRefName | startswith("ralph/"))] | length' 2>/dev/null || echo "")
    [ "$open" = "0" ] && return 0
    sleep 60
    waited=$((waited + 60))
  done
  return 1
}

errors=0  # consecutive iteration errors
blocked=0 # consecutive blocked-on-open-PR iterations
i=0
while [ "$i" -lt "$max" ]; do
  i=$((i + 1))
  echo "── Ralph iteration $i/$max ──"
  set +e
  bash ralph/run.sh
  code=$?
  set -e
  case $code in
  0)
    errors=0 blocked=0
    if ! wait_for_pr_resolution; then
      echo "ralph-loop: PR still open after $((RALPH_PR_WAIT / 60))m — awaiting review/approval. Stopping (normal with approval-gated merges)."
      exit 0
    fi
    ;;
  10)
    echo "ralph-loop: queue empty — done after $i iteration(s)."
    exit 0
    ;;
  11)
    echo "ralph-loop: another runner owns this repo right now — stopping."
    exit 11
    ;;
  12)
    errors=0 # parked with a reason; move to the next task
    ;;
  13)
    blocked=$((blocked + 1))
    if [ "$blocked" -gt 4 ]; then
      echo "ralph-loop: still blocked on an open Ralph PR after 4 backoffs — stopping."
      exit 13
    fi
    s=$((60 * (2 ** (blocked - 1))))
    [ "$s" -gt 900 ] && s=900
    echo "ralph-loop: blocked on an open Ralph PR — backing off ${s}s ($blocked/4)"
    sleep "$s"
    ;;
  20)
    errors=$((errors + 1))
    if [ "$errors" -ge 3 ]; then
      echo "ralph-loop: 3 consecutive iteration errors — stopping. See ralph/runs.jsonl + ralph/logs/."
      notify_discord "🔴 **Ralph loop stopped** on \`$(repo_slug)\` after 3 consecutive iteration errors — check ralph/runs.jsonl + ralph/logs/ on the runner."
      exit 20
    fi
    s=$((60 * (2 ** errors)))
    [ "$s" -gt 900 ] && s=900
    echo "ralph-loop: iteration error — backing off ${s}s ($errors/3)"
    sleep "$s"
    ;;
  *)
    echo "ralph-loop: unexpected exit code $code from run.sh — stopping."
    exit 20
    ;;
  esac
done
echo "ralph-loop: hit the iteration cap ($max)."
