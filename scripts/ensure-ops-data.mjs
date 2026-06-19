#!/usr/bin/env node
/**
 * ensure-ops-data.mjs
 *
 * Makes a clean checkout of @hirobius/ops buildable.
 *
 * The app statically imports four generated artifacts that are .gitignored
 * build outputs (regenerated, never committed):
 *
 *   src/app/data/roadmap.json            ← scripts/build-roadmap-data.mjs
 *   src/app/data/security-posture.json   ← scripts/generate-security-posture.mjs
 *   src/app/data/component-api.json      ← scripts/generate-component-api.mjs
 *   docs/guardrails/strength-report.json ← scripts/generate-strength-report.mjs
 *   telemetry/events.jsonl               ← runtime telemetry  (empty is valid)
 *   docs/guardrails/firing-log.jsonl     ← gate-firing telemetry (empty is valid)
 *
 * On a fresh clone these are absent, so `pnpm typecheck` and `pnpm build`
 * fail with "Cannot find module …json" (or an unresolved `?raw` import).
 * This script idempotently generates
 * ONLY the artifacts that are missing, so it is a cheap no-op on a warm tree.
 * It is wired as a pre-hook for `dev`, `build`, and `typecheck`.
 *
 * Churn-free contract: generate-strength-report.mjs also (re)writes two
 * TRACKED human-readable reports (strength-report.md, SYSTEM_OVERVIEW.md)
 * whose Score-B numbers are environment-sensitive (they depend on Playwright /
 * Lighthouse / pnpm-audit data that a bare container lacks). We snapshot those
 * two files and restore them afterwards so this script never dirties the
 * working tree — the canonical committed reports are left untouched.
 */
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  closeSync,
  openSync,
} from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const r = (p) => resolve(ROOT, p);

function runScript(rel) {
  execFileSync(process.execPath, [r(`scripts/${rel}`)], { stdio: 'inherit', cwd: ROOT });
}

const generated = [];

// 1. Telemetry-style JSONL logs imported with `?raw` — an empty file is valid
//    (parseJsonl in agentic-os/data.ts splits/trims/skips, so "" → []).
for (const log of ['telemetry/events.jsonl', 'docs/guardrails/firing-log.jsonl']) {
  if (!existsSync(r(log))) {
    mkdirSync(dirname(r(log)), { recursive: true });
    closeSync(openSync(r(log), 'a'));
    generated.push(log);
  }
}

// 2. roadmap.json — its generator writes only this gitignored file.
if (!existsSync(r('src/app/data/roadmap.json'))) {
  runScript('build-roadmap-data.mjs');
  generated.push('src/app/data/roadmap.json');
}

// 3. security-posture.json — its generator writes only this gitignored file.
if (!existsSync(r('src/app/data/security-posture.json'))) {
  runScript('generate-security-posture.mjs');
  generated.push('src/app/data/security-posture.json');
}

// 4. component-api.json — prop/type-parity data read by the audit-component-
//    integrity gate and the strength report; generator writes only this
//    gitignored file.
if (!existsSync(r('src/app/data/component-api.json'))) {
  runScript('generate-component-api.mjs');
  generated.push('src/app/data/component-api.json');
}

// 5. strength-report.json — its generator ALSO rewrites two tracked reports;
//    snapshot + restore them so the working tree stays clean.
if (!existsSync(r('docs/guardrails/strength-report.json'))) {
  const tracked = ['docs/guardrails/strength-report.md', 'docs/guardrails/SYSTEM_OVERVIEW.md'];
  const before = tracked.map((p) => (existsSync(r(p)) ? readFileSync(r(p)) : undefined));
  runScript('generate-strength-report.mjs');
  tracked.forEach((p, i) => {
    if (before[i] !== undefined) {
      writeFileSync(r(p), before[i]); // restore the canonical committed bytes
    } else if (existsSync(r(p))) {
      rmSync(r(p)); // file did not exist before — undo the generator's creation
    }
  });
  generated.push('docs/guardrails/strength-report.json');
}

if (generated.length > 0) {
  console.log(`[ensure-ops-data] generated: ${generated.join(', ')}`);
} else {
  console.log('[ensure-ops-data] all data artifacts present — no-op');
}
