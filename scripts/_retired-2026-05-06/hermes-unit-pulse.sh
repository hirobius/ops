#!/usr/bin/env bash
# Pulse wrapper for hermes-unit --loop. Auto-restarts on crash so the
# overnight build keeps running through transient failures (Ollama hiccups,
# OOM, network blips, validation transient errors).
#
# Stops on:
#   - explicit user SIGINT (Ctrl-C in foreground)
#   - 5+ rapid crashes in a row (gives up — likely a real config break)
#
# Usage:
#   bash scripts/hermes-unit-pulse.sh

set -e
cd "$(dirname "$0")/.."

LOG=docs/ai/hermes-unit-pulse.log
HEAL_LOG=docs/ai/agent-heal-log.md
mkdir -p "$(dirname "$LOG")"

trap 'echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — hermes pulse SIGINT, exiting" | tee -a "$LOG"; exit 0' INT

deaths=0
last_death=0
while true; do
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — hermes-pulse: starting hermes-unit --loop" | tee -a "$LOG"
  set +e
  node scripts/hermes-unit.mjs --loop
  exit_code=$?
  set -e

  now=$(date +%s)
  if [ "$exit_code" -eq 0 ]; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — hermes-pulse: clean exit (queue empty?), sleeping 5min" | tee -a "$LOG"
    deaths=0
    sleep 300
  else
    delta=$((now - last_death))
    if [ "$delta" -lt 60 ]; then
      deaths=$((deaths + 1))
    else
      deaths=1
    fi
    last_death=$now
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — hermes-pulse: crashed code=$exit_code (death #$deaths)" | tee -a "$LOG"

    if [ "$deaths" -ge 5 ]; then
      echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — hermes-pulse: 5 rapid crashes — pausing 30min, logging to heal-log" | tee -a "$LOG"
      {
        echo
        echo "## $(date -u +%Y-%m-%dT%H:%M:%SZ) — hermes-unit 5 rapid crashes"
        echo
        echo "hermes-unit-pulse hit 5 crashes in <60s. Likely root causes:"
        echo "- Ollama not running (\`curl http://localhost:11434/api/tags\`)"
        echo "- qwen2.5-coder:14b-hds model missing (\`ollama list\`)"
        echo "- pre-commit gate failing every commit attempt (check \`docs/guardrails/firing-log.jsonl\`)"
        echo "- orchestration.json claim-protocol broken"
        echo
        echo "Pulse paused 30min. Investigate and \`pkill -f hermes-unit-pulse\` to clear if fix is in."
      } >> "$HEAL_LOG"
      sleep 1800
      deaths=0
    else
      sleep 30
    fi
  fi
done
