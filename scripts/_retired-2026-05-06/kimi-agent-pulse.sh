#!/usr/bin/env bash
# Pulse wrapper for kimi-agent --loop. Auto-restarts on crash for overnight
# resilience. Mirrors hermes-unit-pulse.sh.

set -e
cd "$(dirname "$0")/.."

LOG=docs/ai/kimi-agent-pulse.log
HEAL_LOG=docs/ai/agent-heal-log.md
mkdir -p "$(dirname "$LOG")"

trap 'echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — kimi pulse SIGINT, exiting" | tee -a "$LOG"; exit 0' INT

deaths=0
last_death=0
while true; do
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — kimi-pulse: starting kimi-agent --loop" | tee -a "$LOG"
  set +e
  node scripts/kimi-agent.mjs --loop
  exit_code=$?
  set -e

  now=$(date +%s)
  if [ "$exit_code" -eq 0 ]; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — kimi-pulse: clean exit (queue empty?), sleeping 5min" | tee -a "$LOG"
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
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — kimi-pulse: crashed code=$exit_code (death #$deaths)" | tee -a "$LOG"

    if [ "$deaths" -ge 5 ]; then
      echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — kimi-pulse: 5 rapid crashes — pausing 30min, logging to heal-log" | tee -a "$LOG"
      {
        echo
        echo "## $(date -u +%Y-%m-%dT%H:%M:%SZ) — kimi-agent 5 rapid crashes"
        echo
        echo "kimi-agent-pulse hit 5 crashes in <60s. Likely root causes:"
        echo "- MOONSHOT_API_KEY missing or invalid (check .env.local)"
        echo "- Moonshot API rate limit / quota (check api.moonshot.ai dashboard)"
        echo "- Network down (\`curl -I https://api.moonshot.ai/v1\`)"
        echo "- pre-commit gate failing every commit attempt (check \`docs/guardrails/firing-log.jsonl\`)"
        echo
        echo "Pulse paused 30min. Investigate and \`pkill -f kimi-agent-pulse\` to clear if fix is in."
      } >> "$HEAL_LOG"
      sleep 1800
      deaths=0
    else
      sleep 30
    fi
  fi
done
