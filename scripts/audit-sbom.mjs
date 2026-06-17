#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/audit-sbom.mjs
 *
 * Generates a CycloneDX Software Bill of Materials at
 * docs/security/sbom.json. Manual channel — produces an artifact, not a
 * gate. Useful for the GRC narrative and supply-chain review.
 *
 * Usage: pnpm audit:sbom
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';

const argv = process.argv.slice(2);
const jsonMode = hasJsonFlag(argv);

const OUT_DIR = 'docs/security';
const OUT_FILE = `${OUT_DIR}/sbom.json`;

mkdirSync(OUT_DIR, { recursive: true });

const result = { violations: [], summary: {}, ok: true };

try {
  // --ignore-npm-errors: pnpm workspaces install packages outside npm's lock
  // file, so `npm ls` (run internally by cyclonedx-npm) reports ELSPROBLEMS.
  // The flag suppresses those false-positive errors while still producing a
  // complete SBOM. No dependency swap needed — same @cyclonedx/cyclonedx-npm.
  execFileSync(
    'pnpm',
    ['exec', 'cyclonedx-npm', '--ignore-npm-errors', '--output-file', OUT_FILE, '--output-format', 'JSON'],
    { stdio: jsonMode ? 'pipe' : 'inherit' },
  );
  result.summary = { outFile: OUT_FILE };
} catch (err) {
  result.violations.push({
    file: '*',
    line: null,
    rule: 'SBOM_GENERATION_FAILED',
    severity: 'error',
    message: `cyclonedx-npm failed: ${(err.message || String(err)).slice(0, 240)}`,
  });
  result.ok = false;
  emitResult(result, jsonMode);
  process.exit(1);
}

emitResult(result, jsonMode);
process.exit(0);
