#!/usr/bin/env node
/**
 * ensure-ops-data.mjs
 *
 * Makes a clean checkout of @hirobius/ops buildable.
 *
 * The app statically imports gitignored, generated artifacts:
 *
 *   docs/guardrails/strength-report.json ← scripts/generate-strength-report.mjs
 *   lib/tasks/backlog.tasks.json         ← scripts/gen-backlog-tasks.mjs (BACKLOG.md)
 *
 * (strength-history.jsonl is committed; roadmap/security-posture/component-api
 * generators were retired along with their consumers, so they are not run here.)
 *
 * Runs as `prebuild` and `pretypecheck`, so `pnpm build` / `pnpm typecheck`
 * on a fresh clone (local, CI, or Vercel) regenerate the artifacts first.
 */

import { existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const r = (p) => resolve(ROOT, p);

const STRENGTH_REPORT = 'docs/guardrails/strength-report.json';

if (existsSync(r(STRENGTH_REPORT))) {
  console.log('[ensure-ops-data] strength-report.json present — no-op');
} else {
  mkdirSync(dirname(r(STRENGTH_REPORT)), { recursive: true });
  execFileSync(process.execPath, [r('scripts/generate-strength-report.mjs')], {
    stdio: 'inherit',
    cwd: ROOT,
  });
  console.log(`[ensure-ops-data] generated ${STRENGTH_REPORT}`);
}

// backlog.tasks.json — always regenerate so it tracks BACKLOG.md edits.
execFileSync(process.execPath, [r('scripts/gen-backlog-tasks.mjs')], { stdio: 'inherit', cwd: ROOT });
