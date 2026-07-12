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

# ops: the correctness trio (`pnpm check:full` exists if a stricter gate is ever
# wanted). This file is the ONLY per-repo part of the gate — consumers edit it.
run_step pnpm typecheck
run_step pnpm test
run_step pnpm lint

# BS1c: layout/a11y verification ON the auto-merge path. These suites were
# CI-informational only, so a regression could sail through ralph-auto merges;
# the gate now fails closed on them. Chromium is pre-installed in the remote
# sandbox (resolved by playwright.config via PLAYWRIGHT_BROWSERS_PATH — BS1a);
# the CI runner (ubuntu-latest, no pre-install) fetches it once per run.
#   - layout-integrity now audits the REAL dashboard: it stubs /api/ops-me so
#     OpsGate renders the pages, not the production login screen (before that
#     fix the audit was vacuous on every /ops route — it only ever saw the gate).
#   - a11y currently covers the public/login surfaces (/, /info, /ops-gate); it
#     does NOT yet auth-bypass into the dashboard (dashboard axe triage is a
#     tracked follow-up before that's turned on).
# Excluded for runtime/fragility: test:visual (~7 min, platform-pinned pixels),
# test:collision + test:responsive (full matrices) — promote later if needed.
if [ -z "${PLAYWRIGHT_BROWSERS_PATH:-}" ]; then
  run_step pnpm exec playwright install --with-deps chromium
fi
run_step node scripts/check-route-coverage.mjs
# One invocation → one webServer build for both suites (keeps gate latency down).
run_step pnpm exec playwright test tests/layout-integrity.spec.ts tests/a11y.spec.ts

echo "── gate: all green"
