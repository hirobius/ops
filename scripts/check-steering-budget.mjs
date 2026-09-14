#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/check-steering-budget.mjs — cap the always-on agent context (ops#292).
 *
 * Every file in docs/guardrails/steering-budget.json is loaded by every agent in
 * every session before it reads a line of code. On 2026-09-14 that set measured
 * ~189KB / ~47k tokens, of which docs/ai/HANDOFF.md alone was 119KB — a file
 * carrying the instruction "keep it one page" at the top of itself.
 *
 * That is the whole argument for this gate. The steering set did not grow past
 * its own stated limit because nobody knew; it grew because knowing changed
 * nothing. A one-time trim regrows. A budget does not.
 *
 * Kiro's steering files have inclusion modes (always / fileMatch / manual);
 * ours are all "always". This gate is the cheap version of that idea: a small
 * always-on set, everything else referenced by name from CLAUDE.md §1 and
 * loaded on demand.
 *
 * Fix a violation by moving history to an on-demand file — not by raising
 * maxTotalBytes. Raising the budget is a deliberate decision about what every
 * future session pays for, and belongs in a PR that says so.
 *
 * Usage:
 *   node scripts/check-steering-budget.mjs          # report
 *   node scripts/check-steering-budget.mjs --json   # canonical violations shape
 *
 * Exit codes: 0 within budget · 1 over budget / missing file · 2 invocation error.
 *
 * @module check-steering-budget
 */

import { readFileSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateBudget, fmt } from './lib/steering-budget.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = resolve(ROOT, 'docs', 'guardrails', 'steering-budget.json');
const JSON_MODE = process.argv.includes('--json');

function fail(message) {
  if (JSON_MODE) {
    console.log(JSON.stringify({ violations: [{ id: 'gate-error', detail: message }] }, null, 2));
    process.exit(1);
  }
  console.error(`check-steering-budget: ${message}`);
  process.exit(2);
}

if (!existsSync(MANIFEST)) {
  fail(`no manifest at ${MANIFEST} — create it listing the always-on files and maxTotalBytes.`);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
} catch (err) {
  fail(`manifest is not valid JSON: ${err.message}`);
}

const files = Array.isArray(manifest.files) ? manifest.files : [];
const maxTotalBytes = Number(manifest.maxTotalBytes);
if (!files.length) fail('manifest lists no files under "files".');
if (!Number.isFinite(maxTotalBytes) || maxTotalBytes <= 0) {
  fail('manifest needs a positive numeric "maxTotalBytes".');
}

/** @type {Record<string, number|null>} */
const sizes = {};
for (const rel of files) {
  const abs = resolve(ROOT, rel);
  sizes[rel] = existsSync(abs) ? statSync(abs).size : null;
}

const { total, violations } = evaluateBudget({ maxTotalBytes, sizes });

if (JSON_MODE) {
  console.log(JSON.stringify({ violations }, null, 2));
  process.exit(violations.length ? 1 : 0);
}

for (const [rel, size] of Object.entries(sizes)) {
  console.log(`  ${size === null ? '  missing' : fmt(size).padStart(8)}  ${rel}`);
}
console.log(`  ${'—'.repeat(8)}`);
console.log(`  ${fmt(total).padStart(8)}  total (budget ${fmt(maxTotalBytes)})`);

if (!violations.length) {
  console.log(`\n✓ check-steering-budget — always-on context within budget.`);
  process.exit(0);
}
console.error('');
for (const v of violations) console.error(`✗ ${v.detail}`);
process.exit(1);
