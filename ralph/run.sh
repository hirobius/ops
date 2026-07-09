#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
touch progress.txt

claude --permission-mode acceptEdits "@ralph/prompt.md @AGENTS.md @progress.txt

Do ONE iteration only, then stop."
