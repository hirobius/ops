#!/usr/bin/env bash
# Feedback gate Ralph must pass before opening a PR. Red = no PR.
set -euo pipefail
cd "$(dirname "$0")/.."

# Repos WITH the loop system:
# GATE="pnpm loop:validate"
# ops: the standard trio (all three scripts exist). Correctness over speed —
# `pnpm check:full` is available if a stricter gate is ever wanted.
GATE="pnpm typecheck && pnpm test && pnpm lint"

eval "$GATE"
