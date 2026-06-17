#!/usr/bin/env node
/**
 * scripts/persist-learned-rule.mjs
 *
 * Append a learned-rule entry to docs/ai/learned-rules.jsonl, the
 * append-only canon for hermes post-mortem distillation output. Each entry
 * is one JSON line, schema:
 *
 *   {
 *     rule:               "<imperative-verb one-sentence rule>",
 *     rationale:          "<one-sentence why>",
 *     applies_to:         "all" | "T1" | "T2" | "T3",
 *     source:             "hermes-distillation" | "manual" | <other>,
 *     evidence_unit_id:   "<unit-id-that-produced-the-failure>",
 *     ts:                 "<ISO-8601>",
 *     promotedAt?:        "<ISO-8601>",     // set when 13g-13 promote step runs
 *     promotedTo?:        "<registry-entry-id>",  // set after promotion
 *   }
 *
 * Usage as a library:
 *   import { persistLearnedRule } from './scripts/persist-learned-rule.mjs';
 *   persistLearnedRule({ rule, rationale, applies_to, source, evidence_unit_id });
 *
 * Usage as a CLI (one-off / manual entry / piping JSON in):
 *   echo '{"rule":"...", ...}' | node scripts/persist-learned-rule.mjs
 *   node scripts/persist-learned-rule.mjs --rule "..." --rationale "..." --evidence-unit-id 13g-X
 *
 * The append is best-effort: this script never throws, never propagates
 * errors back to the caller. If the JSONL file is missing it's created.
 *
 * Per unit 13g-13-learned-rules-promotion. The promotion step (turning a
 * learned rule into a real registry entry with severity:warn) lives in
 * scripts/promote-learned-rule.mjs and is HITL-only.
 *
 * @module persist-learned-rule
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEARNED_RULES_PATH = path.join(ROOT, 'docs/ai/learned-rules.jsonl');

/**
 * Append a single learned-rule entry to docs/ai/learned-rules.jsonl.
 *
 * Best-effort: never throws. Returns true on success, false on failure.
 *
 * @param {object} entry
 * @param {string} entry.rule
 * @param {string} entry.rationale
 * @param {string} [entry.applies_to='all']
 * @param {string} [entry.source='hermes-distillation']
 * @param {string} [entry.evidence_unit_id]
 * @param {string} [entry.ts]
 */
export function persistLearnedRule(entry) {
  try {
    if (!entry || typeof entry.rule !== 'string' || typeof entry.rationale !== 'string') {
      return false;
    }
    const record = {
      rule: entry.rule,
      rationale: entry.rationale,
      applies_to: entry.applies_to || 'all',
      source: entry.source || 'hermes-distillation',
      evidence_unit_id: entry.evidence_unit_id || null,
      ts: entry.ts || new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(LEARNED_RULES_PATH), { recursive: true });
    fs.appendFileSync(LEARNED_RULES_PATH, JSON.stringify(record) + '\n');
    return true;
  } catch {
    return false;
  }
}

/**
 * Read all entries from docs/ai/learned-rules.jsonl (one JSON line per entry).
 * Skips malformed lines silently. Returns an array.
 */
export function readLearnedRules() {
  try {
    if (!fs.existsSync(LEARNED_RULES_PATH)) return [];
    const raw = fs.readFileSync(LEARNED_RULES_PATH, 'utf8');
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export const LEARNED_RULES_FILE = LEARNED_RULES_PATH;

// ── CLI mode ──────────────────────────────────────────────────────────────────

function isMain() {
  return import.meta.url === `file://${process.argv[1]}`;
}

async function runCli() {
  const argv = process.argv.slice(2);

  function getFlag(name) {
    const i = argv.indexOf(name);
    return i === -1 ? null : argv[i + 1] ?? null;
  }

  // Two input modes:
  //   1. Flags: --rule "..." --rationale "..." --evidence-unit-id <id>
  //   2. Stdin: pipe a JSON object on stdin
  if (argv.includes('--rule') || argv.includes('--rationale')) {
    const entry = {
      rule: getFlag('--rule'),
      rationale: getFlag('--rationale'),
      applies_to: getFlag('--applies-to') || 'all',
      source: getFlag('--source') || 'manual',
      evidence_unit_id: getFlag('--evidence-unit-id'),
    };
    const ok = persistLearnedRule(entry);
    console.log(ok ? `✓ appended to ${path.relative(ROOT, LEARNED_RULES_PATH)}` : '✗ append failed');
    process.exit(ok ? 0 : 1);
  }

  if (!process.stdin.isTTY) {
    const buf = await new Promise((resolve, reject) => {
      let acc = '';
      process.stdin.on('data', (chunk) => { acc += chunk; });
      process.stdin.on('end', () => resolve(acc));
      process.stdin.on('error', reject);
    });
    let entry;
    try { entry = JSON.parse(buf); } catch {
      console.error('persist-learned-rule: stdin is not valid JSON');
      process.exit(1);
    }
    const ok = persistLearnedRule(entry);
    console.log(ok ? `✓ appended to ${path.relative(ROOT, LEARNED_RULES_PATH)}` : '✗ append failed');
    process.exit(ok ? 0 : 1);
  }

  console.error('persist-learned-rule: provide --rule + --rationale, or pipe JSON on stdin');
  console.error('  example: node scripts/persist-learned-rule.mjs --rule "..." --rationale "..." --evidence-unit-id 13g-X');
  process.exit(2);
}

if (isMain()) {
  runCli();
}
