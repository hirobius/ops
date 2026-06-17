#!/usr/bin/env node
/**
 * check-template-source-of-truth.mjs
 *
 * Prevents direct edits to auto-generated output files by checking that
 * if an output file has been modified, the corresponding generator script
 * is also modified in the same changeset.
 *
 * Rationale: Pod 1 edited public/llms.txt directly; Pod 6 found the edit
 * was silently overwritten by the next `pnpm tokens` run. This validator
 * surfaces the pattern early.
 *
 * Auto-generated outputs and their generators:
 *   public/llms.txt               → scripts/generate-llms-txt.mjs
 *   DESIGN.md                     → scripts/build-design-md.mjs (template: DESIGN.source.md)
 *   DESIGN-HANDOFF.md             → scripts/build-handoff.mjs
 *   public/hds-manifest.json      → scripts/generate-manifest.mjs
 *   src/styles/tokens.css         → scripts/build-tokens.mjs
 *   src/styles/tokens.generated.css → scripts/build-tokens.mjs
 *   src/app/design-system/generated-tokens.ts       → scripts/build-tokens.mjs
 *   src/app/design-system/generated-token-values.ts → scripts/build-tokens.mjs
 *   src/app/design-system/generated-token-descriptions.ts → scripts/build-tokens.mjs
 *   src/app/design-system/generated-token-vars.d.ts → scripts/build-tokens.mjs
 *   src/app/design-system/generated-token-refs.ts   → scripts/build-tokens.mjs
 *   tailwind.config.tokens.cjs                      → scripts/build-tokens.mjs
 *
 * Bypass: add `regen-only` to the commit message OR the working-tree
 * change is accompanied by a generator-script change.
 *
 * Usage:
 *   node scripts/check-template-source-of-truth.mjs               # staged-only, hard-fail (pre-commit)
 *   node scripts/check-template-source-of-truth.mjs --warn-only   # staged-only, warn only
 *   node scripts/check-template-source-of-truth.mjs --all         # staged + unstaged (CI / manual)
 *
 * Exit codes: 0 = clean, 1 = violation (in hard-fail mode)
 *
 * Wiring verdict (12g-5): WIRE — pre-commit is the exact right place; this
 * catches the Pod 1 / Pod 6 class of error at the moment it happens.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const args = process.argv.slice(2);
const WARN_ONLY = args.includes('--warn-only');
// --all: include unstaged changes (manual / CI use). Default: staged-only (safe for pre-commit).
const ALL_CHANGES = args.includes('--all');

/**
 * Map of auto-generated output files → their generator script(s).
 * Paths are relative to the repo root.
 */
const AUTO_GEN_MAP = {
  'public/llms.txt': ['scripts/generate-llms-txt.mjs'],
  'DESIGN.md': ['scripts/build-design-md.mjs', 'DESIGN.source.md'],
  'DESIGN-HANDOFF.md': ['scripts/build-handoff.mjs', 'hirobius.tokens.json'],
  'public/hds-manifest.json': ['scripts/generate-manifest.mjs'],
  'src/styles/tokens.css': ['scripts/build-tokens.mjs', 'hirobius.tokens.json'],
  'src/styles/tokens.generated.css': ['scripts/build-tokens.mjs', 'hirobius.tokens.json'],
  'src/app/design-system/generated-tokens.ts': ['scripts/build-tokens.mjs'],
  'src/app/design-system/generated-token-values.ts': ['scripts/build-tokens.mjs'],
  'src/app/design-system/generated-token-descriptions.ts': ['scripts/build-tokens.mjs'],
  'src/app/design-system/generated-token-vars.d.ts': ['scripts/build-tokens.mjs'],
  'src/app/design-system/generated-token-refs.ts': ['scripts/build-tokens.mjs'],
  'tailwind.config.tokens.cjs': ['scripts/build-tokens.mjs'],
};

/**
 * Get the set of changed files.
 * Default: staged only (pre-commit safe — ignores unrelated WIP files).
 * With --all: staged + unstaged (for CI / manual runs).
 */
function getChangedFiles() {
  try {
    const staged = execSync('git diff --cached --name-only', {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();

    const lines = staged.split('\n');

    if (ALL_CHANGES) {
      const unstaged = execSync('git diff --name-only', {
        cwd: ROOT,
        encoding: 'utf8',
      }).trim();
      lines.push(...unstaged.split('\n'));
    }

    const files = new Set();
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) files.add(trimmed);
    }
    return files;
  } catch {
    return new Set();
  }
}

/**
 * Check for the regen-only bypass marker.
 * In pre-commit context, the pending commit message is in .git/COMMIT_EDITMSG.
 * Falls back to the most recent committed message for CI / manual runs.
 * Worktree-safe: resolves the actual git dir via `git rev-parse --git-common-dir`.
 */
function hasRegenOnlyBypass() {
  try {
    // Resolve the actual git directory — handles both plain repos and worktrees.
    // `--git-common-dir` returns the shared git dir (the one with COMMIT_EDITMSG).
    let gitCommonDir;
    try {
      const rawDir = execSync('git rev-parse --git-common-dir', {
        cwd: ROOT,
        encoding: 'utf8',
      }).trim();
      // git may return a relative path; resolve it relative to ROOT
      gitCommonDir = resolve(ROOT, rawDir);
    } catch {
      // Fallback: use ROOT/.git (non-worktree repos)
      gitCommonDir = join(ROOT, '.git');
    }

    // Pre-commit: check the message being composed right now.
    const editmsgPath = join(gitCommonDir, 'COMMIT_EDITMSG');
    if (existsSync(editmsgPath)) {
      const pending = readFileSync(editmsgPath, 'utf8');
      if (pending.toLowerCase().includes('regen-only')) return true;
    }
    // CI / manual: check the most recently committed message.
    const last = execSync('git log -1 --pretty=%B', {
      cwd: ROOT,
      encoding: 'utf8',
    });
    return last.toLowerCase().includes('regen-only');
  } catch {
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const changedFiles = getChangedFiles();
const bypass = hasRegenOnlyBypass();
const violations = [];

for (const [output, generators] of Object.entries(AUTO_GEN_MAP)) {
  if (!changedFiles.has(output)) continue;

  // Output file was changed. Check that at least one generator is also changed.
  const generatorChanged = generators.some((g) => changedFiles.has(g));
  if (generatorChanged) continue;

  // Generator not changed. Check bypass.
  if (bypass) continue;

  // Confirm the output file exists (avoid false positives on deletions).
  const absPath = join(ROOT, output);
  if (!existsSync(absPath)) continue;

  violations.push({
    output,
    generators,
    message: `"${output}" was modified directly without a corresponding change to [${generators.join(', ')}]`,
  });
}

if (violations.length === 0) {
  console.log('✓ check-template-source-of-truth — no direct auto-gen edits detected.');
  process.exit(0);
}

const label = WARN_ONLY ? '⚠' : '✗';
console.log(`\nTemplate source-of-truth violations (${violations.length}):`);
for (const v of violations) {
  console.log(`  ${label}  ${v.message}`);
  console.log(
    `     Fix: edit the template/source [${v.generators.join(', ')}] and re-run the generator.`,
  );
  console.log(`     Bypass (regen-pass only): include "regen-only" in the commit message.`);
}

if (!WARN_ONLY) {
  console.log('\n✗ Direct edits to auto-generated files detected. See above for fix instructions.');
  process.exit(1);
} else {
  console.log('\n⚠ Direct auto-gen edits detected (warn-only mode — not failing).');
}
