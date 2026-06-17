#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/check-token-rebake-needed.mjs
 *
 * Pre-commit guard: ensure generated token outputs are in sync with
 * `hirobius.tokens.json`. A commit that edits the source but skips the
 * rebake silently ships drift; this catches that.
 *
 * What it does:
 *   1. Runs `node scripts/generate-manifest.mjs` and `node scripts/build-tokens.mjs`
 *      (the same chain the `tokens` package script invokes for the
 *      generator-only steps).
 *   2. Diffs each generated output against HEAD.
 *   3. For `public/hds-manifest.json`, the `generated` ISO-timestamp field
 *      is stripped before comparison — every rebake stamps a new value
 *      there, but it does not constitute meaningful drift.
 *   4. Exits 0 if every output matches HEAD; exits 1 with a diagnostic
 *      listing the drifted files otherwise.
 *
 * Wired into `.husky/pre-commit` after `pnpm typecheck`.
 *
 * Manual invocation:
 *   node scripts/check-token-rebake-needed.mjs
 *   node scripts/check-token-rebake-needed.mjs --verbose
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');

const GENERATED_OUTPUTS = [
  'src/styles/tokens.css',
  'src/styles/tokens.generated.css',
  'src/app/design-system/generated-tokens.ts',
  'src/app/design-system/generated-token-values.ts',
  'src/app/design-system/generated-token-descriptions.ts',
  'src/app/design-system/generated-token-vars.d.ts',
  'src/app/design-system/generated-token-refs.ts',
  'tailwind.config.tokens.cjs',
  'public/hds-manifest.json',
];

function run(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    process.stderr.write(err.stdout || '');
    process.stderr.write(err.stderr || '');
    throw err;
  }
}

function gitShow(rev, file) {
  try {
    return execSync(`git show ${rev}:${file}`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return null;
  }
}

/**
 * Strip the `generated` timestamp field from a hds-manifest.json string
 * so it can be compared without false-positives on every rebake.
 */
export function stripManifestTimestamp(json) {
  try {
    const parsed = JSON.parse(json);
    // Recursively strip timestamp fields anywhere in the tree. The manifest
    // carries a top-level `generated` plus nested `generatedAt` under
    // systemHealth and other auto-emitted blocks; non-recursive strip left
    // those nested timestamps in place, causing "content differs" in the
    // rebake-check loop on every commit.
    const TS_KEYS = new Set(['generated', 'generatedAt', 'capturedAt']);
    const walk = (node) => {
      if (Array.isArray(node)) { for (const v of node) walk(v); return; }
      if (node && typeof node === 'object') {
        for (const k of Object.keys(node)) {
          if (TS_KEYS.has(k)) delete node[k];
          else walk(node[k]);
        }
      }
    };
    walk(parsed);
    return JSON.stringify(parsed);
  } catch {
    return json;
  }
}

function fileDiffersFromHead(file) {
  const headContent = gitShow('HEAD', file);
  const stagedContent = gitShow(':0', file); // staged index, if any
  const wtPath = path.join(ROOT, file);
  if (!fs.existsSync(wtPath)) {
    return { differs: true, reason: 'file deleted from working tree' };
  }
  const wtContent = fs.readFileSync(wtPath, 'utf8');
  if (headContent === null && stagedContent === null) {
    return { differs: true, reason: 'file untracked at HEAD' };
  }
  // The user may have already rebaked + staged the new output. Accept disk
  // matching EITHER head OR staged-index — the staged version is what's
  // about to land in the next commit, so it's the correct reference for
  // "are the generated outputs in sync with the build chain?".
  const norm = (s) => s == null ? null : (file === 'public/hds-manifest.json' ? stripManifestTimestamp(s) : s);
  const wtNorm = norm(wtContent);
  if (norm(headContent) === wtNorm) return { differs: false };
  if (norm(stagedContent) === wtNorm) return { differs: false };
  const reason = file === 'public/hds-manifest.json'
    ? 'content differs (timestamp ignored)'
    : 'content differs';
  return { differs: true, reason };
}

function main() {
  if (VERBOSE) process.stderr.write('Running scripts/generate-manifest.mjs ...\n');
  run('node scripts/generate-manifest.mjs');
  if (VERBOSE) process.stderr.write('Running scripts/build-tokens.mjs ...\n');
  run('node scripts/build-tokens.mjs');

  const drifted = [];
  for (const file of GENERATED_OUTPUTS) {
    const result = fileDiffersFromHead(file);
    if (result.differs) drifted.push({ file, reason: result.reason });
  }

  if (drifted.length === 0) {
    if (VERBOSE) process.stderr.write('OK — no token-output drift\n');
    return 0;
  }

  process.stderr.write('TOKEN REBAKE REQUIRED:\n');
  for (const { file, reason } of drifted) {
    process.stderr.write(`  - ${file}  (${reason})\n`);
  }
  process.stderr.write(
    '\nThe generated outputs above differ from HEAD. The token source files were edited\n' +
      'without re-running the build chain. Stage the regenerated files now:\n\n' +
      `  git add ${drifted.map((d) => d.file).join(' ')}\n\n` +
      'Then re-attempt the commit.\n',
  );
  return 1;
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  process.exit(main());
}
