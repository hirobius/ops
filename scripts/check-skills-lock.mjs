#!/usr/bin/env node
/**
 * scripts/check-skills-lock.mjs
 *
 * Drift gate for skills-lock.json: for every pinned skill, asserts it is
 * installed under `.claude/skills/<id>/` and its files hash-match the lock.
 * Read-only, no network — run `node scripts/install-skills.mjs` first to
 * fetch a missing/stale skill, then re-run this to confirm.
 *
 * Usage:
 *   node scripts/check-skills-lock.mjs           # human output, exit 1 on drift
 *   node scripts/check-skills-lock.mjs --json    # machine output (see lib/gate-output.mjs)
 *
 * Fixture mode (tests only, mirrors check-guardrail-drift.mjs):
 *   --fixture-mode with env FIXTURE_FILE=<path> substitutes the lock path,
 *   and reads installed skills from `<dirname(FIXTURE_FILE)>/.claude/skills/`
 *   instead of the real repo tree.
 *
 * Exit codes: 0 clean · 1 drift/missing.
 *
 * @module check-skills-lock
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';
import { loadLock, verifyInstalled } from './lib/skills-lock.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REAL_LOCK_PATH = resolve(ROOT, 'skills-lock.json');

const argv = process.argv.slice(2);
const jsonMode = hasJsonFlag(argv);
const FIXTURE_MODE = argv.includes('--fixture-mode') || process.env.HDS_FIXTURE_MODE === '1';
const FIXTURE_FILE = process.env.FIXTURE_FILE;
const LOCK_PATH = FIXTURE_MODE && FIXTURE_FILE ? resolve(FIXTURE_FILE) : REAL_LOCK_PATH;
const SKILLS_ROOT = FIXTURE_MODE && FIXTURE_FILE ? dirname(LOCK_PATH) : ROOT;

const lock = loadLock(LOCK_PATH);
const violations = [];

for (const [id, entry] of Object.entries(lock.skills)) {
  const result = verifyInstalled(SKILLS_ROOT, id, entry);
  if (result.ok) continue;

  if (result.reason === 'missing') {
    violations.push({
      file: `.claude/skills/${id}`,
      line: null,
      rule: 'SKILL_MISSING',
      severity: 'error',
      message:
        `skill '${id}' is pinned in skills-lock.json but missing file(s) ${result.missing.join(', ')} — ` +
        `run \`node scripts/install-skills.mjs\` to install it.`,
    });
  } else {
    violations.push({
      file: `.claude/skills/${id}`,
      line: null,
      rule: 'SKILL_HASH_DRIFT',
      severity: 'error',
      message:
        `skill '${id}' on disk does not match skills-lock.json (${result.algorithm} expected ` +
        `${result.expected}, got ${result.actual}) — run \`node scripts/install-skills.mjs\` to ` +
        `reinstall the pinned version, or update the lock if the change is intentional.`,
    });
  }
}

const result = {
  violations,
  summary: { skillsChecked: Object.keys(lock.skills).length },
  ok: violations.length === 0,
};

if (!jsonMode) {
  if (result.ok) {
    console.log(`✓ check-skills-lock — ${result.summary.skillsChecked} skill(s) match the lock.`);
  } else {
    console.error(`✗ check-skills-lock — ${violations.length} drift/missing:`);
    for (const v of violations) console.error(`  [${v.rule}] ${v.message}`);
  }
}

emitResult(result, jsonMode);
process.exit(result.ok ? 0 : 1);
