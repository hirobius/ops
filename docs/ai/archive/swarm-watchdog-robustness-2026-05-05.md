# Watchdog robustness battery — 2026-05-05

Run: `node scripts/swarm-watchdog.mjs --robustness-test`
Time: 2026-05-05T08:08:50.879Z

## Summary
Total: 13 | Pass: 13 | Fail: 0

## Results

- ✓ **1. stale-claim revert** — status=approved, attempts=1
- ✓ **2. concurrency cap** — canDispatch=false, reasons=[pods 1 >= 1 cap]
- ✓ **3. cost cap** — canDispatch=false, cost=$2.00
- ✓ **4. wall-clock cap** — reasons=[wall-clock 10.00h >= 4h]
- ✓ **5. attempts cap** — attemptsUnderCap=false
- ✓ **6. cross-contamination** — noOverlapInFlight=false
- ✓ **7. safeForUnattended honor** — safeForUnattended=false
- ✓ **8. atomic write round-trip** — units before=438, after=438
- ✓ **9. dependsOn satisfaction** — dependsOnSatisfied=false
- ✓ **10. haiku forbidden** — notHaiku=false
- ✓ **11. git-status overlap** — noOverlapUncommitted=false
- ✓ **12. decision log written** — log grew 110 bytes
- ✓ **13. boot context loaded** — orch=true, registry=true, policy=true, cost=$0.00

## What this empirically proves

Every safety mechanism the watchdog claims is exercised against a contrived violation here. PASS = the watchdog does what it says. FAIL = it doesn't; the watchdog must not be used until fixed.

Coverage gaps acknowledged (deferred to future units):
- Crashed-child reaping (requires a real Agent dispatch to test)
- JSON corruption recovery (requires snapshot infrastructure from 13g-25)
- Hermes Tier 2 second-opinion (requires Ollama running with qwen2.5-coder:14b-hds)
- Sonnet Tier 3 reflection (deferred until decision log accumulates ~100 entries)
