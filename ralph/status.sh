#!/usr/bin/env bash
# ralph/status.sh — one-shot, read-only health snapshot: "is the loop stuck?"
# Shows the deterministic queue order, open Ralph PRs (+ wedge state), active
# claims (+ staleness), and the last few audited runs.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=ralph/lib.sh
. ralph/lib.sh

echo "Ralph status — $(repo_slug)"
echo

echo "── queue ($RALPH_READY_LABEL, deterministic order: p-label, then issue #)"
gh issue list --label "$RALPH_READY_LABEL" --state open --limit 100 \
  --json number,title,labels --jq '
  def prio: [.labels[].name | select(test("^p[0-3]$"))] | sort | (first // "p-");
  map(select([.labels[].name] as $l
    | (($l | index("blocked")) or ($l | index("needs-adrian"))
       or ($l | index("ralph-parked"))) | not))
  | sort_by([(prio | sub("^p";"") | if . == "-" then 9 else tonumber end), .number])
  | if length == 0 then "  (empty)"
    else .[] | "  \(prio)  #\(.number)  \(.title)" end' 2>/dev/null || echo "  (gh unavailable)"
echo

echo "── open ralph PRs"
prs=$(open_ralph_prs 2>/dev/null || echo '[]')
if [ "$(jq length <<<"$prs")" -eq 0 ]; then
  echo "  (none — loop is free to pick up work)"
else
  jq -r '.[] | "  #\(.number)  \(.headRefName)  updated \(.updatedAt)"' <<<"$prs"
  wedged=$(classify_wedged <<<"$prs")
  if [ -n "$wedged" ]; then
    echo "  ⚠️ WEDGED:"
    sed 's/^/  /' <<<"$wedged"
  else
    echo "  (healthy in-flight)"
  fi
fi
echo

echo "── active claims (refs/heads/ralph/claim-*)"
claims=$(git ls-remote origin 'refs/heads/ralph/claim-*' 2>/dev/null | awk '{print $2}' || true)
if [ -z "$claims" ]; then
  echo "  (none)"
else
  for ref in $claims; do
    n=${ref#refs/heads/ralph/claim-}
    if claim_is_stale "$n"; then
      echo "  #$n — STALE (reclaimable on the next run)"
    else
      echo "  #$n — fresh (a runner is on it)"
    fi
  done
fi
echo

echo "── last runs (ralph/runs.jsonl)"
if [ -f ralph/runs.jsonl ]; then
  tail -n 5 ralph/runs.jsonl | jq -r '"  \(.ts)  #\(.issue)  \(.decision) → \(.result) (\(.exit_reason))"'
else
  echo "  (no runs recorded on this machine yet)"
fi
