#!/usr/bin/env node
/**
 * check-parked-triggers — evaluate the re-entry triggers in docs/ai/PARKED.md.
 *
 * PARKED.md holds work deliberately kept out of the issue queue because its
 * reason to act lies in the future. Each entry carries a `trigger:` naming the
 * condition that should put it back. Without something evaluating those, the
 * file becomes a graveyard — which is the failure mode it exists to prevent.
 *
 * Trigger kinds:
 *   date: YYYY-MM-DD        fires once that date has passed
 *   path: some/path         fires when the path's existence flips from the
 *                           recorded expectation (present when it shouldn't be)
 *   issue: ops#78 closed    reported for manual confirmation (no network here)
 *   event: <prose>          not machine-checkable; surfaced at quarterly review
 *
 * Exit codes: 0 = nothing due · 1 = at least one trigger fired.
 * Read-only. Never edits PARKED.md — re-entry is a deliberate human act.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const PARKED = join(repoRoot, 'docs/ai/PARKED.md');

if (!existsSync(PARKED)) {
  console.error('check-parked-triggers: docs/ai/PARKED.md not found — nothing to check.');
  process.exit(0);
}

const lines = readFileSync(PARKED, 'utf8').split('\n');

/** Parse `### Title` blocks and the `- **trigger:** \`kind: value\`` lines under them. */
function parseEntries(src) {
  const entries = [];
  let current = null;
  for (const line of src) {
    const heading = /^###\s+(.*\S)\s*$/.exec(line);
    if (heading) {
      current = { title: heading[1], triggers: [], origin: null };
      entries.push(current);
      continue;
    }
    if (!current) continue;
    const origin = /^\s*-\s+\*\*origin:\*\*\s*(.+?)\s*$/.exec(line);
    if (origin) current.origin = origin[1];
    // `- **trigger:** \`date: 2026-12-01\`` and the `- **also:**` continuation
    const trig = /^\s*-\s+\*\*(?:trigger|also):\*\*\s*`([a-z]+):\s*([^`]+)`/.exec(line);
    if (trig) current.triggers.push({ kind: trig[1], value: trig[2].trim() });
  }
  return entries;
}

const entries = parseEntries(lines);
if (entries.length === 0) {
  console.log('check-parked-triggers: no parked entries.');
  process.exit(0);
}

const today = new Date();
today.setHours(0, 0, 0, 0);
const fired = [];
const manual = [];

for (const entry of entries) {
  for (const t of entry.triggers) {
    if (t.kind === 'date') {
      const due = new Date(`${t.value}T00:00:00Z`);
      if (Number.isNaN(due.getTime())) {
        console.error(`  ! ${entry.title}: unparseable date "${t.value}"`);
        continue;
      }
      if (due <= today) fired.push({ entry, t, why: `date ${t.value} has passed` });
    } else if (t.kind === 'path') {
      // Entries record a path that should NOT exist; its reappearance is the signal.
      const p = join(repoRoot, t.value);
      if (existsSync(p)) fired.push({ entry, t, why: `path "${t.value}" exists again` });
    } else {
      // issue: / event: — needs a human or the network. Surface, don't guess.
      manual.push({ entry, t });
    }
  }
}

const quarterly = /^\*\*Next quarterly review:\s*(\d{4}-\d{2}-\d{2})\.\*\*/m.exec(
  readFileSync(PARKED, 'utf8'),
);
let reviewDue = false;
if (quarterly) {
  const when = new Date(`${quarterly[1]}T00:00:00Z`);
  reviewDue = !Number.isNaN(when.getTime()) && when <= today;
}

console.log(
  `check-parked-triggers: ${entries.length} parked entr${entries.length === 1 ? 'y' : 'ies'}.`,
);

if (fired.length) {
  console.log('\n🔔 TRIGGERS FIRED — these should re-enter the queue:\n');
  for (const f of fired) {
    console.log(`  • ${f.entry.title}`);
    console.log(`      ${f.why}`);
    if (f.entry.origin) console.log(`      origin: ${f.entry.origin}`);
  }
  console.log('\n  File a FRESH issue citing the parked entry + its origin issue,');
  console.log('  then delete the entry from docs/ai/PARKED.md.');
  console.log('  Do not reopen the original — its premise is stale by definition.\n');
}

if (reviewDue) {
  console.log(`\n📅 Quarterly review is due (${quarterly[1]}).`);
  console.log('   Walk the event: triggers below and decide each: still parked, or file it?\n');
}

if (manual.length && (reviewDue || fired.length)) {
  console.log('  Human-evaluated triggers:');
  for (const m of manual) console.log(`    – ${m.entry.title}\n        ${m.t.kind}: ${m.t.value}`);
  console.log('');
}

if (fired.length || reviewDue) process.exit(1);
console.log('Nothing due. Next check: whenever a condition changes, or the quarterly review.');
process.exit(0);
