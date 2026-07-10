#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/audit-orphan-modules.mjs
 *
 * Sweeps the repo for orphan modules — source files nothing imports.
 * Wraps `knip --reporter json` and surfaces its "unused files" category
 * as registry violations. Companion to the existing `pnpm knip` /
 * `pretest` invocations, which run the full knip rule set (unused
 * exports, deps, etc.) without gating — this narrows to just orphan
 * files so the guardrail has a single, stable meaning.
 *
 * Severity: warn — informational sweep, never blocks. A file knip
 * flags may be a legitimate SSR/build entry point (e.g.
 * src/entry-server.tsx) that's reached by a config, not an import;
 * triage each hit rather than deleting on sight.
 *
 * Usage: pnpm audit:orphan-modules [--json]
 */

import { execFileSync } from 'node:child_process';
import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';

const argv = process.argv.slice(2);
const jsonMode = hasJsonFlag(argv);

const result = { violations: [], summary: {}, ok: true };

let raw;
try {
  raw = execFileSync('pnpm', ['exec', 'knip', '--reporter', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (err) {
  // knip exits non-zero whenever it finds anything to report — that's
  // expected here, the findings are on stdout.
  raw = err.stdout?.toString() || '';
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  parsed = { issues: [] };
}

const issues = Array.isArray(parsed.issues) ? parsed.issues : [];

for (const issue of issues) {
  if (!Array.isArray(issue.files) || issue.files.length === 0) continue;
  result.violations.push({
    file: issue.file,
    line: null,
    rule: 'ORPHAN_MODULE',
    severity: 'warn',
    message: `${issue.file}: not imported by any other module (knip unused-file)`,
  });
}

result.summary = { total: result.violations.length };
result.ok = true;

if (jsonMode) {
  emitResult(result, jsonMode);
} else if (result.violations.length > 0) {
  console.warn(`\naudit-orphan-modules: ${result.violations.length} orphan module(s) found:\n`);
  for (const v of result.violations) {
    console.warn(`  ${v.file}`);
  }
  console.warn('\nEach is either dead code (delete it) or a legitimate entry point knip');
  console.warn("can't see (e.g. SSR entry, config-only reference) — mark it in knip.json.\n");
} else {
  console.log('audit-orphan-modules: no orphan modules found');
}

// Severity: warn — always exit 0. Findings are informational; wire a
// --strict flag here if this ever needs to gate.
process.exit(0);
