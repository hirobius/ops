#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/audit-orphan-modules.mjs
 *
 * Orphan-module sweeper. Wraps `knip --reporter json` and reports its
 * unused-files category — source files that no entry point or import graph
 * reaches. knip's JSON reporter groups issues per-file (parsed.issues[]);
 * an entry is an unused file when its own `files` array is non-empty (as
 * opposed to unlisted/unresolved/exports entries, which flag other issue
 * kinds for that file). Warn severity, never blocks: same precedent as
 * audit-deps (informational until a human decides an orphan is dead code
 * vs. a knip.config.ts gap). Manual/pnpm-meta channel — not pre-commit,
 * knip's full project graph is too slow for that.
 *
 * Usage: pnpm audit:orphan-modules
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';

const argv = process.argv.slice(2);
const jsonMode = hasJsonFlag(argv);
const fixtureMode = argv.includes('--fixture-mode') || process.env.HDS_FIXTURE_MODE === '1';
const fixtureFile = process.env.FIXTURE_FILE;

const result = { violations: [], summary: {}, ok: true };

let raw;
if (fixtureMode && fixtureFile) {
  // Fixture mode: read the fixture file directly as knip's JSON output.
  try {
    raw = readFileSync(fixtureFile, 'utf8');
  } catch (err) {
    process.stderr.write(
      `audit-orphan-modules: cannot read fixture file ${fixtureFile}: ${err.message}\n`,
    );
    process.exit(2);
  }
} else {
  try {
    raw = execFileSync('pnpm', ['exec', 'knip', '--reporter', 'json', '--no-exit-code'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    raw = err.stdout?.toString() || '{}';
  }
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  parsed = {};
}

const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
const orphans = issues
  .filter((issue) => Array.isArray(issue.files) && issue.files.length > 0)
  .map((issue) => issue.file);

for (const file of orphans) {
  result.violations.push({
    file,
    line: null,
    rule: 'ORPHAN_MODULE',
    severity: 'warn',
    message: `${file}: unreachable from any entry point (knip unused-files)`,
  });
}

result.ok = true; // warn severity only — never blocks
result.summary = { totalOrphans: orphans.length };

emitResult(result, jsonMode);
process.exit(0);
