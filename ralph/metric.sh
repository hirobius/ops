#!/usr/bin/env bash
# ralph/metric.sh — measure a registry gate's violation count against a
# target. Powers ralph-metric.yml (ops#90): a bounded, self-terminating
# Ralph loop whose queue AND stop-condition are a number, not a
# human-tagged issue.
#
# <metric> is a gate id from docs/guardrails/registry.json. Its gateScript
# must support `--json` and return the canonical `{ violations: Array }`
# shape (see scripts/audit-gates-supportjson.mjs, the compliance ratchet
# for that contract) — pick a compliant gate, or bring one into compliance
# first. <target> is the violation count to reach (0 = fully clean).
#
# stdout (on success): `current=<n> target=<n>`
# Exit:
#   0 = current <= target — COMPLETE, no batch needed
#   1 = current  > target — one bounded batch needed
#   2 = usage/registry/contract error (fails loud, names the fix — never
#       silently treated as "at target" or "needs a batch")
set -euo pipefail
cd "$(dirname "$0")/.."

metric="${1:?usage: ralph/metric.sh <gate-id> <target>}"
target="${2:?usage: ralph/metric.sh <gate-id> <target>}"

if ! [[ "$target" =~ ^[0-9]+$ ]]; then
  echo "ralph/metric.sh: target must be a non-negative integer, got '$target'." >&2
  exit 2
fi

registry="docs/guardrails/registry.json"
if [ ! -f "$registry" ]; then
  echo "ralph/metric.sh: $registry not found — run this from a Ralph-enabled repo checkout." >&2
  exit 2
fi

gate_script=$(jq -r --arg id "$metric" '.gates[] | select(.id == $id) | .gateScript // empty' "$registry")
if [ -z "$gate_script" ]; then
  echo "ralph/metric.sh: no gate id '$metric' in $registry — pick one from .gates[].id." >&2
  exit 2
fi
if [ ! -f "$gate_script" ]; then
  echo "ralph/metric.sh: registry entry '$metric' points at '$gate_script', which doesn't exist — fix the registry entry (docs/guardrails/registry.json) before measuring this metric." >&2
  exit 2
fi

# Gates report violations via exit code too (0 clean, 1 found-violations) —
# both are a successful measurement here; only a crash (missing --json
# support, a thrown error) should abort the loop.
raw=$(node "$gate_script" --json 2>/dev/null) || true
current=$(jq -r 'if (.violations | type) == "array" then (.violations | length) else empty end' <<<"$raw" 2>/dev/null || true)

if [ -z "$current" ]; then
  echo "ralph/metric.sh: '$metric' ($gate_script --json) didn't return the canonical { violations: Array } shape — this gate isn't ratcheted for --json yet (see scripts/audit-gates-supportjson.mjs). Pick a compliant gate, or fix this one's --json output first." >&2
  exit 2
fi

echo "current=$current target=$target"

[ "$current" -le "$target" ]
