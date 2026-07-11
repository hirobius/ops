#!/usr/bin/env bash
# Feedback gate Ralph must pass before opening a PR. Red = no PR — the gate
# FAILS CLOSED: any step failing aborts immediately and names the culprit.
set -euo pipefail
cd "$(dirname "$0")/.."

run_step() {
  echo "── gate: $*"
  if ! "$@"; then
    echo "── gate FAILED at: $* — no PR, no done. Fix the change until green." >&2
    exit 1
  fi
}

# ops: the standard trio — correctness over speed (`pnpm check:full` exists if
# a stricter gate is ever wanted; repos with the loop CLI use `pnpm loop:validate`).
# This file is the ONLY per-repo part of the gate — consumers edit these steps.
run_step pnpm typecheck
run_step pnpm test
run_step pnpm lint

echo "── gate: all green"
