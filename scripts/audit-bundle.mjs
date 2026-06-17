#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/audit-bundle.mjs
 *
 * Generates a bundle composition report at docs/perf/bundle-report.html
 * using vite-bundle-visualizer. Manual channel — artifact, not gating.
 * Complements size-limit (which gates total size) by showing which
 * modules contribute to the bundle.
 *
 * Usage: pnpm audit:bundle
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';

const argv = process.argv.slice(2);
const jsonMode = hasJsonFlag(argv);

const OUT_DIR = 'docs/perf';
const OUT_FILE = `${OUT_DIR}/bundle-report.html`;

mkdirSync(OUT_DIR, { recursive: true });

const result = { violations: [], summary: {}, ok: true };

try {
  execFileSync('pnpm', ['exec', 'vite-bundle-visualizer', '-o', OUT_FILE], {
    stdio: jsonMode ? 'pipe' : 'inherit',
  });
  result.summary = { outFile: OUT_FILE };
} catch (err) {
  result.violations.push({
    file: '*',
    line: null,
    rule: 'BUNDLE_VIZ_FAILED',
    severity: 'error',
    message: `vite-bundle-visualizer failed: ${(err.message || String(err)).slice(0, 240)}`,
  });
  result.ok = false;
  emitResult(result, jsonMode);
  process.exit(1);
}

emitResult(result, jsonMode);
process.exit(0);
