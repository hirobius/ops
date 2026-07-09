#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[ -z "${1:-}" ] && { echo "Usage: $0 <iterations>"; exit 1; }
touch progress.txt

for ((i=1; i<=$1; i++)); do
  echo "── Ralph $i/$1 ──"
  result=$(claude --permission-mode acceptEdits -p "@ralph/prompt.md @AGENTS.md @progress.txt

Do ONE iteration only. If no ralph-ready issues remain, output <promise>COMPLETE</promise>.")
  echo "$result"
  [[ "$result" == *"<promise>COMPLETE</promise>"* ]] && { echo "Done after $i."; exit 0; }
done
echo "Hit cap ($1)."
