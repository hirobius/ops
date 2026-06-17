#!/usr/bin/env python3
"""scripts/compact-done-units.py

Compacts done units in docs/ai/orchestration.json.

The file currently sits at ~7000 lines, 87% of which is metadata for
status:done units the watchdog rarely revisits (validationCmd, agentNotes,
verbose descriptions, history). This shrinks the live file to a scannable
size by stripping done-unit fields the active workflow doesn't need,
while preserving the full record in a pre-compact snapshot.

Per unit status:done, keep:
  id, status, name, cluster, phase, tier, model, completedAt, dependsOn

Drop:
  history, validationCmd, agentNotes, description, lastAbort,
  claimedBy, claimedAt, attempts, approval, sprint, priority, effort,
  safeForUnattended

Why dependsOn stays: validate-orchestration historically asserts dependsOn
integrity (every referenced id exists). Keeping it is cheap insurance.

Active units (approved / claimed / parked / denied / needs-grilling) are
kept verbatim.

Pre-compact snapshot is written to
  docs/ai/snapshots/orchestration-pre-compact-<UTC-TS>.json
so the full data is recoverable. Atomic write via .tmp + rename;
ensure_ascii=False to preserve unicode (per the standing rule).

Per Adrian directive 2026-05-05: 7000 → ~2500 lines.

Usage:
  python3 scripts/compact-done-units.py           # apply
  python3 scripts/compact-done-units.py --dry-run # preview only
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ORCH = ROOT / "docs/ai/orchestration.json"
SNAPSHOTS = ROOT / "docs/ai/snapshots"

KEEP_DONE_FIELDS = {
    "id",
    "status",
    "name",
    "cluster",
    "phase",
    "tier",
    "model",
    "completedAt",
    "dependsOn",
}

dry_run = "--dry-run" in sys.argv

if not ORCH.exists():
    print(f"✗ compact-done-units: {ORCH} not found", file=sys.stderr)
    sys.exit(1)

with ORCH.open() as f:
    db = json.load(f)

units = db.get("units", [])
if not isinstance(units, list):
    print("✗ compact-done-units: db.units is not a list", file=sys.stderr)
    sys.exit(1)

before_lines = sum(1 for _ in ORCH.open())
before_bytes = ORCH.stat().st_size

# Snapshot pre-compact state.
ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")
SNAPSHOTS.mkdir(parents=True, exist_ok=True)
snapshot_path = SNAPSHOTS / f"orchestration-pre-compact-{ts}.json"

# Compact in memory first so dry-run can report identical numbers.
compacted = 0
kept_full = 0
for u in units:
    if u.get("status") == "done":
        keys_to_drop = [k for k in list(u.keys()) if k not in KEEP_DONE_FIELDS]
        for k in keys_to_drop:
            del u[k]
        compacted += 1
    else:
        kept_full += 1

if dry_run:
    # Estimate post-compact size by serializing in memory.
    serialized = json.dumps(db, indent=2, ensure_ascii=False) + "\n"
    after_bytes = len(serialized.encode("utf-8"))
    after_lines = serialized.count("\n")
    print(f"DRY RUN — would compact {compacted} done units; keep {kept_full} active full")
    print(f"  before: {before_lines:>5} lines / {before_bytes:>7} bytes")
    print(f"  after:  {after_lines:>5} lines / {after_bytes:>7} bytes")
    print(f"  saved:  {before_lines - after_lines} lines ({100*(before_lines-after_lines)//before_lines}%)")
    sys.exit(0)

# Re-read original to write the snapshot (we mutated `db` for the in-place compaction).
with ORCH.open() as f:
    original_db = json.load(f)
with snapshot_path.open("w") as f:
    json.dump(original_db, f, indent=2, ensure_ascii=False)
    f.write("\n")
print(f"snapshot: {snapshot_path.relative_to(ROOT)}")

# Atomic write of compacted form.
tmp = ORCH.with_suffix(".json.tmp")
with tmp.open("w") as f:
    json.dump(db, f, indent=2, ensure_ascii=False)
    f.write("\n")
os.replace(tmp, ORCH)

after_lines = sum(1 for _ in ORCH.open())
after_bytes = ORCH.stat().st_size

print(f"compacted {compacted} done units; kept {kept_full} active full")
print(f"  before: {before_lines:>5} lines / {before_bytes:>7} bytes")
print(f"  after:  {after_lines:>5} lines / {after_bytes:>7} bytes")
print(f"  saved:  {before_lines - after_lines} lines ({100*(before_lines-after_lines)//before_lines}%)")
