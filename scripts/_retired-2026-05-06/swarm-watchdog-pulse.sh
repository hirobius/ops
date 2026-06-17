#!/usr/bin/env bash
# Swarm-watchdog pulse wrapper. Restarts the watchdog automatically if it
# exits unexpectedly so the overnight build keeps running through transient
# failures (cycle errors, JSON corruption, OS hiccups, kill signals).
#
# Stops on:
#   - explicit user SIGINT (Ctrl-C in the foreground terminal)
#   - explicit cap-reached exits (wall-clock / cost) — the watchdog already
#     prints these to its log, and we honor that "intentional exit" by
#     pausing before restart
#
# Usage:
#   bash scripts/swarm-watchdog-pulse.sh           # default conservative caps
#   bash scripts/swarm-watchdog-pulse.sh --max-pods 2 --max-cost-usd 5
#
# Reads everything from .env / shell env. Caps default to the plan's first-
# night conservative settings.

set -e
cd "$(dirname "$0")/.."

LOG=docs/ai/swarm-watchdog-pulse.log
mkdir -p "$(dirname "$LOG")"

# Default caps per Adrian's plan; override on the command line.
ARGS="${@:-"--max-pods 1 --max-hours 4 --max-cost-usd 3 --max-attempts 2 --watch"}"

# Trap SIGINT so the user can Ctrl-C cleanly.
trap 'echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — pulse wrapper SIGINT, exiting" | tee -a "$LOG"; exit 0' INT

# Failure-pause backoff (in seconds). After 3 quick deaths, pause longer.
deaths=0
last_death=0

while true; do
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — pulse: starting watchdog with: $ARGS" | tee -a "$LOG"
  set +e
  node scripts/swarm-watchdog.mjs $ARGS
  exit_code=$?
  set -e
  now=$(date +%s)

  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — pulse: watchdog exited code=$exit_code" | tee -a "$LOG"

  # Cap-reached or queue-empty exits (code 0 with intentional exit log) — pause longer.
  if [ "$exit_code" -eq 0 ]; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — pulse: clean exit (cap or empty), sleeping 5min before next attempt" | tee -a "$LOG"
    sleep 300
    deaths=0
    continue
  fi

  # Crashy fast-restart guard: 3 deaths in <5min triggers a 10min cool-off.
  if [ "$((now - last_death))" -lt 300 ]; then
    deaths=$((deaths + 1))
  else
    deaths=1
  fi
  last_death=$now

  if [ "$deaths" -ge 3 ]; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — pulse: 3 fast deaths, cooling off 10min" | tee -a "$LOG"
    sleep 600
    deaths=0
  else
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — pulse: restarting in 30s..." | tee -a "$LOG"
    sleep 30
  fi
done
