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
#   - failed attempts ≥ RALPH_MAX_ATTEMPTS            → parked to ralph-parked
# Issues labeled blocked / needs-adrian / ralph-parked, or holding a fresh
# claim (refs/heads/ralph/claim-<n>), are skipped. Stale claims (older than
# RALPH_CLAIM_TTL, no open PR) do NOT block selection — run.sh reclaims them.
#
# stdout: the selected issue number (nothing else).
# Exit:   0 = picked · 10 = queue empty/exhausted · 20 = GitHub API failure.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=ralph/lib.sh
. ralph/lib.sh

issues=$(gh_retry issue list --label "$RALPH_READY_LABEL" --state open \
  --limit 100 --json number,labels,body) || exit 20

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

  fails=$(count_failed_attempts "$n")
  if [ "${fails:-0}" -ge "$RALPH_MAX_ATTEMPTS" ]; then
    echo "ralph: #$n already failed $fails attempt(s) — parking" >&2
    park_issue "$n" "hit the attempt cap ($fails/$RALPH_MAX_ATTEMPTS failed attempts — see the ralph-attempt-failed comments above)." ralph-parked >&2
    continue
  fi

  echo "$n"
  exit 0
done

exit 10
