#!/usr/bin/env bash
# Top-level heal supervisor: periodically checks all three daemons (watchdog,
# hermes-unit, kimi-agent) and (re)launches any that have died. Designed to
# be the one thing Adrian leaves running overnight — it owns starting all
# agents, restarting them if they fall over, and writing a heal log so the
# next-session human can see what self-corrected.
#
# Idempotent: if a process is already running, it leaves it alone. If you
# launch this twice, the second instance will detect the first and exit.
#
# Usage:
#   bash scripts/agent-heal-loop.sh
#
# Stop:
#   pkill -f agent-heal-loop.sh   # also stops the children it owns
#   OR Ctrl-C in foreground

set -e
cd "$(dirname "$0")/.."

HEAL_LOG=docs/ai/agent-heal-log.md
LOG=docs/ai/agent-heal-loop.log
mkdir -p "$(dirname "$LOG")"

# Singleton: only one heal-loop should run at a time.
PIDFILE=/tmp/agent-heal-loop.pid
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "agent-heal-loop already running (pid $(cat "$PIDFILE")) — exiting"
  exit 0
fi
echo $$ > "$PIDFILE"
trap 'rm -f "$PIDFILE"; echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — heal-loop SIGINT, exiting" | tee -a "$LOG"; exit 0' INT TERM

CYCLE_SECS=60

start_if_dead() {
  local name="$1"
  local pattern="$2"
  local cmd="$3"
  local pidvar="$4"

  if pgrep -f "$pattern" >/dev/null 2>&1; then
    return 0
  fi

  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — heal-loop: $name not running, launching" | tee -a "$LOG"
  {
    echo
    echo "## $(date -u +%Y-%m-%dT%H:%M:%SZ) — heal-loop restarted $name"
    echo
    echo "Process matching \`$pattern\` was not running. Restarted via heal-loop."
  } >> "$HEAL_LOG"

  nohup bash -c "$cmd" > "/tmp/${name}-heal-restart.out" 2>&1 &
  sleep 2
}

while true; do
  # Watchdog (announces eligibility, manages stale claims)
  start_if_dead \
    "swarm-watchdog" \
    "swarm-watchdog-pulse.sh" \
    "bash scripts/swarm-watchdog-pulse.sh --max-pods 2 --max-hours 12 --max-cost-usd 30 --max-attempts 2 --watch"

  # Hermes-unit DISABLED 2026-05-06 — fake-done bug + thrash-only behavior on
  # T2 work it grabs as T1. Running kimi solo until validationCmd architecture
  # is tightened (per-unit deliverable proofs, not project-wide health checks).
  # See commits 46f68082 + fc8defac for the fake-done evidence and analysis.
  # To re-enable: uncomment the start_if_dead block below.
  # start_if_dead \
  #   "hermes-unit" \
  #   "hermes-unit-pulse.sh" \
  #   "bash scripts/hermes-unit-pulse.sh"

  # Kimi-agent (T2 reasoning executor — Moonshot API, paid)
  start_if_dead \
    "kimi-agent" \
    "kimi-agent-pulse.sh" \
    "bash scripts/kimi-agent-pulse.sh"

  # Heartbeat to the log so we can see this loop is alive.
  alive=$(pgrep -fc -E '(swarm-watchdog-pulse|hermes-unit-pulse|kimi-agent-pulse)' || true)
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — heal-loop: $alive/3 agent pulses alive" >> "$LOG"

  sleep "$CYCLE_SECS"
done
