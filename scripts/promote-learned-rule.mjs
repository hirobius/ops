#!/usr/bin/env node
/**
 * scripts/promote-learned-rule.mjs
 *
 * Interactive walker over docs/ai/learned-rules.jsonl. For each unprommoted
 * entry (no `promotedAt` field), prompts Adrian to promote it to a real
 * registry entry in docs/guardrails/registry.json. The actual flip from
 * learned-rule → registry-entry is HITL by design (per unit 13g-13): a
 * stochastic LLM-distilled rule should never auto-write to the gate set.
 *
 * Workflow per entry:
 *   1. Show rule + rationale + evidence_unit_id + applies_to
 *   2. Ask: [p]romote / [s]kip / [d]rop / [q]uit
 *   3. On promote: emit a registry skeleton stanza for Adrian to paste in,
 *      stamp the entry with { promotedAt, promotedTo }, and re-write the
 *      JSONL file (idempotent: existing promoted entries pass through).
 *
 * NEVER edits docs/guardrails/registry.json directly — promotion of a
 * learned rule to a wired gate is a real engineering act (gate script
 * authorship, fixture creation, channel selection). The interactive flow
 * just stages the decision; Adrian wires the gate in a follow-up commit.
 *
 * Usage:
 *   node scripts/promote-learned-rule.mjs
 *   node scripts/promote-learned-rule.mjs --list     # non-interactive listing
 *   node scripts/promote-learned-rule.mjs --json     # JSON output for piping
 *
 * Per unit 13g-13-learned-rules-promotion. Today: infra-only deliverable;
 * the validation that a learned rule has caught a real fixture-violation
 * (then promote to severity:error) is Adrian's call.
 *
 * @module promote-learned-rule
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { stdin as input, stdout as output } from 'node:process';

import { readLearnedRules, LEARNED_RULES_FILE } from './persist-learned-rule.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flagList = argv.includes('--list');
const flagJson = argv.includes('--json');

const rules = readLearnedRules();
const unpromoted = rules.filter((r) => !r.promotedAt);
const promoted = rules.filter((r) => r.promotedAt);

if (flagJson) {
  console.log(JSON.stringify({ totalRules: rules.length, unpromoted, promoted }, null, 2));
  process.exit(0);
}

if (flagList) {
  console.log(`learned-rules: ${rules.length} total · ${unpromoted.length} unprommoted · ${promoted.length} promoted`);
  console.log(`source: ${path.relative(ROOT, LEARNED_RULES_FILE)}`);
  if (unpromoted.length === 0) {
    console.log('\n(no unprommoted rules)');
  } else {
    console.log('\nUnpromoted rules:');
    unpromoted.forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.evidence_unit_id ?? '?'}] ${r.rule}`);
      console.log(`     rationale: ${r.rationale}`);
      console.log(`     ts: ${r.ts}    applies_to: ${r.applies_to ?? 'all'}    source: ${r.source ?? 'unknown'}`);
    });
  }
  process.exit(0);
}

// ── Interactive walk ──────────────────────────────────────────────────────────

if (!input.isTTY) {
  console.error('promote-learned-rule: interactive mode requires a TTY. Use --list or --json for non-interactive.');
  process.exit(2);
}

if (unpromoted.length === 0) {
  console.log('No unprommoted rules. Nothing to do.');
  console.log(`(${rules.length} total in ${path.relative(ROOT, LEARNED_RULES_FILE)})`);
  process.exit(0);
}

const rl = readline.createInterface({ input, output });

console.log(`promote-learned-rule: ${unpromoted.length} unprommoted rule(s) to walk`);
console.log(`source: ${path.relative(ROOT, LEARNED_RULES_FILE)}`);
console.log('');

let i = 0;
let promotedThisRun = 0;
let droppedThisRun = 0;

function emitRegistrySkeleton(rule) {
  const id = `learned-${(rule.evidence_unit_id ?? 'unknown').replace(/[^a-z0-9-]/gi, '-')}-${Date.now()}`;
  return {
    suggestedId: id,
    skeleton: {
      id,
      gateScript: `scripts/check-${id}.mjs`,
      firingChannel: 'pnpm-meta',
      severity: 'warn',
      strictArgv: null,
      learnedFrom: rule.evidence_unit_id ?? null,
      rationale: rule.rationale,
    },
  };
}

function writeBackJsonl(allRules) {
  const tmp = `${LEARNED_RULES_FILE}.tmp`;
  fs.writeFileSync(tmp, allRules.map((r) => JSON.stringify(r)).join('\n') + (allRules.length ? '\n' : ''));
  fs.renameSync(tmp, LEARNED_RULES_FILE);
}

while (i < unpromoted.length) {
  const r = unpromoted[i];
  console.log('─'.repeat(72));
  console.log(`[${i + 1}/${unpromoted.length}] ${r.rule}`);
  console.log(`  rationale: ${r.rationale}`);
  console.log(`  evidence:  ${r.evidence_unit_id ?? '(none)'}`);
  console.log(`  applies_to: ${r.applies_to ?? 'all'}    source: ${r.source ?? 'unknown'}    ts: ${r.ts}`);
  console.log('');
  const ans = (await rl.question('[p]romote / [s]kip / [d]rop / [q]uit > ')).trim().toLowerCase();
  if (ans === 'q' || ans === 'quit') break;
  if (ans === 's' || ans === 'skip' || ans === '') {
    console.log('  → skipped (left unprommoted; will surface again next run)');
    i += 1;
    continue;
  }
  if (ans === 'd' || ans === 'drop') {
    r.droppedAt = new Date().toISOString();
    r.droppedReason = (await rl.question('  drop reason (one line) > ')).trim();
    droppedThisRun += 1;
    i += 1;
    continue;
  }
  if (ans === 'p' || ans === 'promote') {
    const { suggestedId, skeleton } = emitRegistrySkeleton(r);
    const promoteTo = (await rl.question(`  registry-entry id [${suggestedId}] > `)).trim() || suggestedId;
    skeleton.id = promoteTo;
    skeleton.gateScript = `scripts/check-${promoteTo}.mjs`;
    r.promotedAt = new Date().toISOString();
    r.promotedTo = promoteTo;
    promotedThisRun += 1;
    console.log('');
    console.log('  Suggested registry entry to add to docs/guardrails/registry.json:');
    console.log('  ' + JSON.stringify(skeleton, null, 2).split('\n').join('\n  '));
    console.log('');
    console.log('  Next steps (Adrian, manual):');
    console.log(`    1. Author scripts/check-${promoteTo}.mjs that enforces this rule`);
    console.log(`    2. Add the skeleton above to registry.json (severity: warn initially)`);
    console.log(`    3. Add fixtures/${promoteTo}/{passing,violating}.example.<ext>`);
    console.log(`    4. Once the gate catches the violating fixture, promote to severity: error`);
    i += 1;
    continue;
  }
  console.log(`  unknown answer '${ans}' — repeating this rule`);
}

rl.close();
writeBackJsonl(rules);

console.log('');
console.log(`Done: ${promotedThisRun} promoted, ${droppedThisRun} dropped, ${unpromoted.length - i} unprommoted left.`);
console.log('Promotion stamps written to ' + path.relative(ROOT, LEARNED_RULES_FILE));
