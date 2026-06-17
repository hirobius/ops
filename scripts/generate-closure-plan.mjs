#!/usr/bin/env node
/**
 * scripts/generate-closure-plan.mjs
 *
 * Auto-regenerates the per-row table in
 * `docs/guardrails/full-strictness-closure-plan.md` from
 * `docs/guardrails/full-strictness-inventory.json`. Per unit 13p-10.
 *
 * Each violation entry across all gates becomes one row. Row key:
 *   <gate-id>::<file>::<line>::<rule>
 *
 * On regen:
 *   - Parses the existing markdown between
 *     `<!-- BEGIN auto-generated rows -->` and
 *     `<!-- END auto-generated rows -->` markers.
 *   - Extracts the (row-key → classification) map from the existing rows.
 *   - For each new row from the current inventory:
 *       * If row-key matches an existing entry, preserve classification.
 *       * Otherwise, classification: TODO.
 *   - Removed rows (existed before, not in current inventory) get logged
 *     to `docs/guardrails/closure-plan-removed.jsonl` for audit.
 *   - The hand-edited preamble + open-question section OUTSIDE the
 *     markers stays untouched. Only the table body changes.
 *
 * Idempotency: running twice with the same inventory produces a
 * byte-identical plan (rows are stably sorted).
 *
 * Usage:
 *   node scripts/generate-closure-plan.mjs        # regen plan in place
 *   node scripts/generate-closure-plan.mjs --check  # exit 1 if regen would change the plan
 *
 * @module generate-closure-plan
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INVENTORY_PATH = path.join(ROOT, 'docs/guardrails/full-strictness-inventory.json');
const PLAN_PATH = path.join(ROOT, 'docs/guardrails/full-strictness-closure-plan.md');
const REMOVED_LOG = path.join(ROOT, 'docs/guardrails/closure-plan-removed.jsonl');

const argv = process.argv.slice(2);
const checkMode = argv.includes('--check');
const verbose = argv.includes('--verbose');

const BEGIN_MARKER = '<!-- BEGIN auto-generated rows -->';
const END_MARKER = '<!-- END auto-generated rows -->';

// ── Load inventory ───────────────────────────────────────────────────────────

if (!fs.existsSync(INVENTORY_PATH)) {
  console.error(`✗ generate-closure-plan: inventory not found at ${INVENTORY_PATH}`);
  console.error('  Run: node scripts/run-gates.mjs --channel pre-commit --emit-inventory docs/guardrails/full-strictness-inventory.json');
  process.exit(2);
}

let inventory;
try {
  inventory = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
} catch (e) {
  console.error(`✗ generate-closure-plan: inventory parse failed: ${e.message}`);
  process.exit(2);
}

// ── Build current row set ────────────────────────────────────────────────────

const currentRows = [];
for (const gate of inventory.gates ?? []) {
  if (!Array.isArray(gate.violations)) continue;
  for (const v of gate.violations) {
    const file = v.file ?? '*';
    const line = v.line == null ? 'null' : String(v.line);
    const rule = v.rule ?? 'unknown';
    const key = `${gate.id}::${file}::${line}::${rule}`;
    currentRows.push({
      key,
      gateId: gate.id,
      file,
      line,
      rule,
      severity: v.severity ?? 'info',
      message: v.message ?? '',
    });
  }
}

// Stable sort: severity-first (error > warn > baselined > info), then gate, file, line, rule
const SEVERITY_ORDER = { error: 0, warn: 1, baselined: 2, info: 3 };
currentRows.sort((a, b) => {
  const sa = SEVERITY_ORDER[a.severity] ?? 4;
  const sb = SEVERITY_ORDER[b.severity] ?? 4;
  if (sa !== sb) return sa - sb;
  if (a.gateId !== b.gateId) return a.gateId.localeCompare(b.gateId);
  if (a.file !== b.file) return a.file.localeCompare(b.file);
  if (a.line !== b.line) return a.line.localeCompare(b.line);
  return a.rule.localeCompare(b.rule);
});

// ── Parse existing plan, extract preserved classifications ───────────────────

if (!fs.existsSync(PLAN_PATH)) {
  console.error(`✗ generate-closure-plan: plan not found at ${PLAN_PATH}`);
  process.exit(2);
}

const planRaw = fs.readFileSync(PLAN_PATH, 'utf8');
const beginIdx = planRaw.indexOf(BEGIN_MARKER);
const endIdx = planRaw.indexOf(END_MARKER);

if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
  console.error(`✗ generate-closure-plan: closure plan must contain BEGIN/END markers`);
  console.error(`  Add these on their own lines: ${BEGIN_MARKER}  ...  ${END_MARKER}`);
  process.exit(2);
}

const preamble = planRaw.slice(0, beginIdx + BEGIN_MARKER.length);
const postamble = planRaw.slice(endIdx);

// Existing rows live between markers. Parse to extract row-key → classification.
const existingBlock = planRaw.slice(beginIdx + BEGIN_MARKER.length, endIdx);

const preservedMap = new Map(); // rowKey → classification text

// Row format we emit (and parse back):
//   | <gate-id> | <file> | <line> | <rule> | <severity> | <classification> |
// HTML comment immediately above each row carries the row key:
//   <!-- key: <gate-id>::<file>::<line>::<rule> -->
const KEY_COMMENT_RE = /<!--\s*key:\s*([^\s][^>]*?)\s*-->/;
const TABLE_ROW_RE = /^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/;

const existingLines = existingBlock.split('\n');
let pendingKey = null;
for (const line of existingLines) {
  const km = line.match(KEY_COMMENT_RE);
  if (km) {
    pendingKey = km[1].trim();
    continue;
  }
  if (pendingKey && TABLE_ROW_RE.test(line)) {
    const m = line.match(TABLE_ROW_RE);
    const classification = (m[6] || '').trim();
    if (classification && !/^classification\b/i.test(classification)) {
      preservedMap.set(pendingKey, classification);
    }
    pendingKey = null;
  }
}

// ── Detect removed rows ──────────────────────────────────────────────────────

const currentKeys = new Set(currentRows.map((r) => r.key));
const removedKeys = [];
for (const oldKey of preservedMap.keys()) {
  if (!currentKeys.has(oldKey)) removedKeys.push(oldKey);
}

// ── Emit new rows block ──────────────────────────────────────────────────────

const lines = [];
lines.push('');
lines.push(`> Auto-generated by \`scripts/generate-closure-plan.mjs\` from \`docs/guardrails/full-strictness-inventory.json\`. ${currentRows.length} row(s). Do not edit between BEGIN/END markers — re-run \`pnpm closure:plan\`. Edit only the **classification** column; row keys preserve your edits across regens.`);
lines.push('');

if (currentRows.length === 0) {
  lines.push('_(No violation rows in the current inventory.)_');
  lines.push('');
} else {
  lines.push('| gate | file | line | rule | severity | classification |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of currentRows) {
    lines.push(`<!-- key: ${r.key} -->`);
    const cls = preservedMap.get(r.key) || 'classification: TODO';
    // Pipe characters in cell content would break the markdown table — escape them.
    const safe = (s) => String(s).replace(/\|/g, '\\|');
    lines.push(`| ${safe(r.gateId)} | ${safe(r.file)} | ${safe(r.line)} | ${safe(r.rule)} | ${safe(r.severity)} | ${safe(cls)} |`);
  }
  lines.push('');
}

const newBlock = lines.join('\n');
const newPlan = preamble + newBlock + postamble;

// ── Write or check ──────────────────────────────────────────────────────────

if (checkMode) {
  if (newPlan !== planRaw) {
    console.error('✗ generate-closure-plan --check: plan would change. Run without --check to update.');
    process.exit(1);
  }
  console.log('✓ generate-closure-plan --check: plan is up-to-date');
  process.exit(0);
}

// Atomic write
const tmp = `${PLAN_PATH}.tmp`;
fs.writeFileSync(tmp, newPlan);
fs.renameSync(tmp, PLAN_PATH);

// Append removed-row audit log
if (removedKeys.length > 0) {
  const ts = new Date().toISOString();
  const entries = removedKeys
    .map((key) => JSON.stringify({ ts, removedRowKey: key, priorClassification: preservedMap.get(key) }))
    .join('\n') + '\n';
  fs.mkdirSync(path.dirname(REMOVED_LOG), { recursive: true });
  fs.appendFileSync(REMOVED_LOG, entries);
}

const summary = {
  total: currentRows.length,
  preserved: currentRows.filter((r) => preservedMap.has(r.key)).length,
  newRows: currentRows.filter((r) => !preservedMap.has(r.key)).length,
  removed: removedKeys.length,
};

console.log(`✓ generate-closure-plan — ${path.relative(ROOT, PLAN_PATH)}`);
console.log(`  rows: ${summary.total} (${summary.preserved} preserved · ${summary.newRows} new · ${summary.removed} removed)`);
if (verbose && removedKeys.length > 0) {
  console.log('\nRemoved rows (logged to docs/guardrails/closure-plan-removed.jsonl):');
  for (const k of removedKeys) console.log(`  - ${k}`);
}
