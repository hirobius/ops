#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/check-licenses.mjs
 *
 * License compliance gate. Runs `pnpm licenses list --prod --json` and
 * filters against a deny-list of copyleft / restrictive licenses
 * (GPL/AGPL/LGPL/SSPL/BUSL/EUPL/OSL/CC-BY-NC/CDDL).
 *
 * Pre-commit gate. Uses pnpm's built-in license tooling — no extra dep.
 *
 * Usage: pnpm check:licenses
 */

import { execFileSync } from 'node:child_process';
import { readFileSync as fsReadFileSync } from 'node:fs';
import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';

const argv = process.argv.slice(2);
const jsonMode = hasJsonFlag(argv);
const fixtureMode = argv.includes('--fixture-mode') || process.env.HDS_FIXTURE_MODE === '1';
const fixtureFile = process.env.FIXTURE_FILE;

const DENY_PATTERNS = [
  /^GPL/i,
  /^AGPL/i,
  /^LGPL/i,
  /^SSPL/i,
  /^BUSL/i,
  /^EUPL/i,
  /^OSL/i,
  /^CC-BY-NC/i,
  /^CDDL/i,
];

const result = { violations: [], summary: {}, ok: true };

let raw;
if (fixtureMode && fixtureFile) {
  // Fixture mode: read the fixture file directly as the license list JSON.
  try {
    raw = fsReadFileSync(fixtureFile, 'utf8');
  } catch (err) {
    process.stderr.write(`check-licenses: cannot read fixture file ${fixtureFile}: ${err.message}\n`);
    process.exit(2);
  }
} else {
  try {
    raw = execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
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

const offenders = [];
for (const [licenseName, packages] of Object.entries(parsed)) {
  if (DENY_PATTERNS.some((p) => p.test(licenseName))) {
    for (const pkg of Array.isArray(packages) ? packages : []) {
      offenders.push({ name: pkg.name, version: pkg.version, license: licenseName });
    }
  }
}

for (const o of offenders) {
  result.violations.push({
    file: 'package.json',
    line: null,
    rule: 'LICENSE_DENYLIST',
    severity: 'error',
    message: `dependency ${o.name}@${o.version} uses a deny-listed license: ${o.license}`,
  });
}
result.ok = offenders.length === 0;
result.summary = { totalLicenseGroups: Object.keys(parsed).length, offenders: offenders.length };

emitResult(result, jsonMode);
process.exit(offenders.length > 0 ? 1 : 0);
