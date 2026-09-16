#!/usr/bin/env node
/**
 * scripts/promote-learned-rule.mjs
 *
 * Interactive walker over docs/ai/learned-rules.jsonl. For each unpromoted
 * entry (no `promotedAt` field), prompts Adrian to promote it to one of two
 * destinations:
 *
 *   - [g]ate     — a registry-gate skeleton for docs/guardrails/registry.json.
 *                  The right bar for a rule that can be mechanically checked.
 *   - [s]teering — a one-line bullet for a steering doc (AGENTS.md, CLAUDE.md,
 *                  or docs/ai/AGENT_GUIDELINES.md). The right bar for a rule
 *                  that isn't checkable but should still change what a future
 *                  session does. Per docs/ai/FRONTIER-DOCTRINE.md §4, steering
 *                  is a budget — pick the cheapest file that still reaches the
 *                  sessions that need the rule.
 *
 * Both flips are HITL by design (per unit 13g-13 and #292's steering budget):
 * a stochastic LLM-distilled rule should never auto-write to a gate or an
 * always-on doc. This script only STAGES the artifact (prints it); it never
 * writes docs/guardrails/registry.json or any steering file directly. Adrian
 * pastes the staged text in a follow-up commit.
 *
 * Workflow per entry:
 *   1. Show rule + rationale + evidence_unit_id + applies_to
 *   2. Ask: [g]ate / [s]teering / [k]skip / [d]rop / [q]uit
 *   3. On promote (either destination): stamp the entry with
 *      { promotedAt, promotedTo }, where promotedTo is "registry:<id>" for a
 *      gate promotion or "steering:<file>" for a steering promotion — so the
 *      JSONL records *where* a rule landed, not just that it did — and
 *      re-write the JSONL file (idempotent: existing promoted entries pass
 *      through unchanged).
 *
 * Usage:
 *   node scripts/promote-learned-rule.mjs
 *   node scripts/promote-learned-rule.mjs --list                    # non-interactive listing
 *   node scripts/promote-learned-rule.mjs --json                    # JSON output for piping
 *   node scripts/promote-learned-rule.mjs --list --fixture-file <p> # point at a stubbed JSONL (tests)
 *
 * Per unit 13g-13-learned-rules-promotion + ops#300 (second destination).
 * Today: infra-only deliverable; the validation that a learned rule has
 * caught a real fixture-violation (then promote to severity:error) is
 * Adrian's call.
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

// ── Destination guidance (ops#300 tasks: "Destination guidance in the prompt") ─
// repo-specific → AGENTS.md; fleet-wide → CLAUDE.md; dispatch/sub-agent →
// AGENT_GUIDELINES.md (on-demand under #292, so it's the cheap destination).
export const STEERING_TARGETS = [
  { file: 'AGENTS.md', guidance: 'repo-specific' },
  { file: 'CLAUDE.md', guidance: 'fleet-wide' },
  { file: 'docs/ai/AGENT_GUIDELINES.md', guidance: 'dispatch / sub-agent' },
];
export const DEFAULT_STEERING_TARGET = 'CLAUDE.md';

// ── Pure staging logic (unit-testable: no prompts, no file I/O, no network) ──

/**
 * Build a registry-gate skeleton for a learned rule. Pure — does not write
 * docs/guardrails/registry.json; the caller prints/stages it.
 */
export function emitRegistrySkeleton(rule, id) {
  const suggestedId =
    id ||
    `learned-${(rule.evidence_unit_id ?? 'unknown').replace(/[^a-z0-9-]/gi, '-')}-${Date.now()}`;
  return {
    suggestedId,
    promotedTo: `registry:${suggestedId}`,
    skeleton: {
      id: suggestedId,
      gateScript: `scripts/check-${suggestedId}.mjs`,
      firingChannel: 'pnpm-meta',
      severity: 'warn',
      strictArgv: null,
      learnedFrom: rule.evidence_unit_id ?? null,
      rationale: rule.rationale,
    },
  };
}

/**
 * Build a one-line steering-doc bullet for a learned rule. Pure — does not
 * write the target file; the caller prints/stages it.
 */
export function emitSteeringSkeleton(rule, targetFile) {
  const file = targetFile || DEFAULT_STEERING_TARGET;
  return {
    targetFile: file,
    promotedTo: `steering:${file}`,
    line: `- **${rule.rule}** ${rule.rationale}`,
  };
}

/**
 * Classify a stamped `promotedTo` string back into its destination + target.
 * Anything not matching the "registry:" / "steering:" prefixes is treated as
 * `legacy` (pre-ops#300 entries stamped with a bare registry id).
 */
export function classifyPromotion(promotedTo) {
  if (!promotedTo) return null;
  if (promotedTo.startsWith('registry:')) {
    return { destination: 'gate', target: promotedTo.slice('registry:'.length) };
  }
  if (promotedTo.startsWith('steering:')) {
    return { destination: 'steering', target: promotedTo.slice('steering:'.length) };
  }
  return { destination: 'legacy', target: promotedTo };
}

export function summarizeRules(rules) {
  const unpromoted = rules.filter((r) => !r.promotedAt);
  const promoted = rules.filter((r) => r.promotedAt);
  const gate = promoted.filter((r) => classifyPromotion(r.promotedTo)?.destination === 'gate');
  const steering = promoted.filter(
    (r) => classifyPromotion(r.promotedTo)?.destination === 'steering',
  );
  return { total: rules.length, unpromoted, promoted, gate, steering };
}

export function buildListOutput(rules) {
  const { total, unpromoted, promoted, gate, steering } = summarizeRules(rules);
  const lines = [
    `learned-rules: ${total} total · ${unpromoted.length} unpromoted · ${promoted.length} promoted (${gate.length} gate, ${steering.length} steering)`,
  ];
  if (unpromoted.length === 0) {
    lines.push('', '(no unpromoted rules)');
  } else {
    lines.push('', 'Unpromoted rules:');
    unpromoted.forEach((r, i) => {
      lines.push(`  ${i + 1}. [${r.evidence_unit_id ?? '?'}] ${r.rule}`);
      lines.push(`     rationale: ${r.rationale}`);
      lines.push(
        `     ts: ${r.ts}    applies_to: ${r.applies_to ?? 'all'}    source: ${r.source ?? 'unknown'}`,
      );
    });
  }
  return lines.join('\n');
}

export function buildJsonOutput(rules) {
  const { total, unpromoted, promoted, gate, steering } = summarizeRules(rules);
  return {
    totalRules: total,
    unpromoted,
    promoted: promoted.map((r) => ({
      ...r,
      promotedDestination: classifyPromotion(r.promotedTo)?.destination ?? null,
    })),
    promotedByDestination: { gate: gate.length, steering: steering.length },
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function isMain() {
  return import.meta.url === `file://${process.argv[1]}`;
}

function writeBackJsonl(rulesPath, allRules) {
  const tmp = `${rulesPath}.tmp`;
  fs.writeFileSync(
    tmp,
    allRules.map((r) => JSON.stringify(r)).join('\n') + (allRules.length ? '\n' : ''),
  );
  fs.renameSync(tmp, rulesPath);
}

async function runCli() {
  const argv = process.argv.slice(2);
  const flagList = argv.includes('--list');
  const flagJson = argv.includes('--json');
  const fixtureIdx = argv.indexOf('--fixture-file');
  const fixtureFile = fixtureIdx !== -1 ? argv[fixtureIdx + 1] : process.env.LEARNED_RULES_FIXTURE;
  const rulesPath = fixtureFile ? path.resolve(fixtureFile) : LEARNED_RULES_FILE;

  const rules = readLearnedRules(rulesPath);

  if (flagJson) {
    console.log(JSON.stringify(buildJsonOutput(rules), null, 2));
    return;
  }

  if (flagList) {
    console.log(`source: ${path.relative(ROOT, rulesPath)}`);
    console.log(buildListOutput(rules));
    return;
  }

  if (!input.isTTY) {
    console.error(
      'promote-learned-rule: interactive mode requires a TTY. Use --list or --json for non-interactive.',
    );
    process.exitCode = 2;
    return;
  }

  const unpromoted = rules.filter((r) => !r.promotedAt);

  if (unpromoted.length === 0) {
    console.log('No unpromoted rules. Nothing to do.');
    console.log(`(${rules.length} total in ${path.relative(ROOT, rulesPath)})`);
    return;
  }

  const rl = readline.createInterface({ input, output });

  console.log(`promote-learned-rule: ${unpromoted.length} unpromoted rule(s) to walk`);
  console.log(`source: ${path.relative(ROOT, rulesPath)}`);
  console.log('');

  let i = 0;
  let promotedThisRun = 0;
  let droppedThisRun = 0;

  while (i < unpromoted.length) {
    const r = unpromoted[i];
    console.log('─'.repeat(72));
    console.log(`[${i + 1}/${unpromoted.length}] ${r.rule}`);
    console.log(`  rationale: ${r.rationale}`);
    console.log(`  evidence:  ${r.evidence_unit_id ?? '(none)'}`);
    console.log(
      `  applies_to: ${r.applies_to ?? 'all'}    source: ${r.source ?? 'unknown'}    ts: ${r.ts}`,
    );
    console.log('');
    const ans = (await rl.question('[g]ate / [s]teering / [k]skip / [d]rop / [q]uit > '))
      .trim()
      .toLowerCase();

    if (ans === 'q' || ans === 'quit') break;

    if (ans === 'k' || ans === 'skip' || ans === '') {
      console.log('  → skipped (left unpromoted; will surface again next run)');
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

    if (ans === 'g' || ans === 'gate') {
      const { suggestedId, skeleton } = emitRegistrySkeleton(r);
      const promoteTo =
        (await rl.question(`  registry-entry id [${suggestedId}] > `)).trim() || suggestedId;
      skeleton.id = promoteTo;
      skeleton.gateScript = `scripts/check-${promoteTo}.mjs`;
      r.promotedAt = new Date().toISOString();
      r.promotedTo = `registry:${promoteTo}`;
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

    if (ans === 's' || ans === 'steering') {
      console.log('');
      console.log('  Destination guidance:');
      STEERING_TARGETS.forEach((t) => console.log(`    ${t.file}  —  ${t.guidance}`));
      const targetFile =
        (await rl.question(`  target file [${DEFAULT_STEERING_TARGET}] > `)).trim() ||
        DEFAULT_STEERING_TARGET;
      const { line, promotedTo } = emitSteeringSkeleton(r, targetFile);
      r.promotedAt = new Date().toISOString();
      r.promotedTo = promotedTo;
      promotedThisRun += 1;
      console.log('');
      console.log(
        `  Suggested line to add to ${targetFile} (Adrian, manual — never written by this script):`,
      );
      console.log('  ' + line);
      i += 1;
      continue;
    }

    console.log(`  unknown answer '${ans}' — repeating this rule`);
  }

  rl.close();
  writeBackJsonl(rulesPath, rules);

  console.log('');
  console.log(
    `Done: ${promotedThisRun} promoted, ${droppedThisRun} dropped, ${unpromoted.length - i} unpromoted left.`,
  );
  console.log('Promotion stamps written to ' + path.relative(ROOT, rulesPath));
}

if (isMain()) {
  runCli();
}
