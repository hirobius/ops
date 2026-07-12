#!/usr/bin/env bash
# ralph/next.sh — deterministic task selector for the Ralph loop.
#
# Same repo state → same pick, always: open `ralph-ready` issues are ordered
# by priority label (p0 < p1 < p2 < p3 < unlabeled), then ascending issue
# number. The LLM never chooses — this script does, and run.sh / the CI guard
# both call it, so local and CI runs agree on "next".
#
# Candidates are vetted in order and parked (with a written reason) when:
#   - the body has no acceptance-criteria/DoD marker → parked to needs-adrian
#   - a ralph PR merged/closed AFTER the latest ralph-ready labeling exists
#     (last cycle already ended in a merge or a human rejection, yet the
#     issue is still open+queued)                     → parked to needs-adrian
#   - failed attempts ≥ RALPH_MAX_ATTEMPTS            → parked to ralph-parked
# Issues labeled blocked / needs-adrian / ralph-parked, or holding a fresh
# claim (refs/heads/ralph/claim-<n>), are skipped — as is any candidate whose
# history/budget cannot be verified (API failure fails closed: skip, no park).
# Stale claims (older than RALPH_CLAIM_TTL, no open PR) do NOT block
# selection — run.sh reclaims them.
#
# stdout: the selected issue number (nothing else).
# Exit:   0 = picked · 10 = queue empty/exhausted · 20 = GitHub API failure.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=ralph/lib.sh
. ralph/lib.sh

issues=$(gh_retry issue list --label "$RALPH_READY_LABEL" --state open \
  --limit 100 --json number,labels,body) || exit 20

# One prefetch of every non-open ralph/issue-* PR — the history guard in the
# candidate walk needs it, and fetching once keeps the walk O(1) API calls.
history=$(gh_retry pr list --state all --limit 200 --json headRefName,state,mergedAt,closedAt \
  --jq '[.[] | select(.headRefName | startswith("ralph/issue-")) | select(.state != "OPEN")]') || exit 20

ordered=$(jq -r '
  def prio: [.labels[].name | select(test("^p[0-3]$"))] | sort | (first // "p9")
            | ltrimstr("p") | tonumber;
  map(select([.labels[].name] as $l
    | (($l | index("blocked")) or ($l | index("needs-adrian"))
       or ($l | index("ralph-parked"))) | not))
  | sort_by([prio, .number]) | .[].number' <<<"$issues")

[ -z "$ordered" ] && exit 10

has_dod_marker() {
  grep -qiE -- '- \[ \]|acceptance|definition of done|\bDoD\b' <<<"$1"
}

for n in $ordered; do
  # Freshly claimed by another runner → theirs, move on. Stale → offer it;
  # run.sh's claim step deletes the stale ref atomically before re-claiming.
  if claim_ref_exists "$n" && ! claim_is_stale "$n"; then
    echo "ralph: #$n is claimed (fresh) — skipping" >&2
    continue
  fi

  body=$(jq -r --argjson n "$n" '.[] | select(.number == $n) | .body // ""' <<<"$issues")
  if ! has_dod_marker "$body"; then
    echo "ralph: #$n has no acceptance-criteria/DoD marker — parking" >&2
    # >&2: this script's stdout is ONLY the selected issue number; park side
    # effects must never leak into it (callers capture it).
    park_issue "$n" "no acceptance criteria found in the body (looked for a \`- [ ]\` checklist or an acceptance / DoD / definition-of-done section). Add one, then re-add \`$RALPH_READY_LABEL\`." needs-adrian >&2
    continue
  fi

  # PR-history guard: a merged/closed ralph PR NEWER than the latest
  # ralph-ready labeling means the last queue-cycle already ended in a merge
  # (issue still open → the remainder isn't agent-actionable; hds#126 looped
  # on exactly this) or in a human rejection (needs direction, not a retry).
  # Re-adding the ready label moves the boundary — a deliberate re-queue
  # still works. An unknowable boundary fails closed: skip, never park.
  boundary=$(latest_ready_label_at "$n")
  if [ "$boundary" = "unknown" ]; then
    echo "ralph: cannot fetch #$n's label events (API failure) — skipping (fail-closed)" >&2
    continue
  fi
  verdict=$(jq -r --arg p "ralph/issue-$n-" --arg b "${boundary:-1970-01-01T00:00:00Z}" '
    [.[] | select(.headRefName | startswith($p))
         | select(((.mergedAt // .closedAt) // "") > $b)]
    | if any(.state == "MERGED") then "merged"
      elif length > 0 then "closed" else "" end' <<<"$history")
  if [ "$verdict" = "merged" ]; then
    echo "ralph: #$n already has merged PR(s) newer than its last $RALPH_READY_LABEL labeling — parking" >&2
    park_issue "$n" "prior Ralph PR(s) merged but the issue is still open — the remainder looks not agent-actionable. Close the issue or split what's left into a new issue, then re-add \`$RALPH_READY_LABEL\`." needs-adrian >&2
    continue
  fi
  if [ "$verdict" = "closed" ]; then
    echo "ralph: #$n has human-closed Ralph PR(s) newer than its last $RALPH_READY_LABEL labeling — parking" >&2
    park_issue "$n" "Ralph PR(s) for this issue were closed without merging — a human rejection needs direction, not a retry. Decide the path, then re-add \`$RALPH_READY_LABEL\`." needs-adrian >&2
    continue
  fi

  fails=$(count_failed_attempts "$n" "${boundary:-1970-01-01T00:00:00Z}")
  if [ "$fails" = "unknown" ]; then
    echo "ralph: cannot verify #$n's attempt budget (API failure) — skipping (fail-closed)" >&2
    continue
  fi
  if [ "${fails:-0}" -ge "$RALPH_MAX_ATTEMPTS" ]; then
    echo "ralph: #$n already failed $fails attempt(s) — parking" >&2
    park_issue "$n" "hit the attempt cap ($fails/$RALPH_MAX_ATTEMPTS failed attempts — see the ralph-attempt-failed comments above)." ralph-parked >&2
    continue
  fi

  echo "$n"
  exit 0
done

exit 10
