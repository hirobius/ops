#!/usr/bin/env node
/**
 * promote-to-core.mjs — promote a lab component to core after a
 * 4-check Promotion Checklist:
 *   1. no-hex-colors   — no raw `#RRGGBB` / `#RGB` outside of comments
 *   2. uses-tokens     — at least one `var(--semantic-…)` or `var(--primitive-…)`
 *   3. has-typed-props — exports a `[Foo]Props` type / interface
 *   4. has-export      — at least one `export` statement
 *
 * Source resolution (input is a component slug):
 *   src/app/components/lab/<slug>.tsx → src/app/components/<slug>.tsx
 *
 * On pass, the file is copied. On any failure, the script prints the
 * checklist and exits non-zero without modifying core.
 *
 * Refs: t_be5c5b75 / AI Build skills bundle — promote-to-core
 */

import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAB_DIR = path.join(REPO_ROOT, 'src/app/components/lab');
const CORE_DIR = path.join(REPO_ROOT, 'src/app/components');

/** Strip line and block comments so regex checks don't fire on commentary. */
function stripComments(source) {
  return String(source || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const CHECKS = [
  {
    id: 'no-hex-colors',
    label: 'No raw hex colors in source',
    test: (src) => !/#[0-9A-Fa-f]{3,8}\b/.test(stripComments(src)),
  },
  {
    id: 'uses-tokens',
    label: 'Consumes at least one CSS-var token',
    test: (src) => /var\(--(semantic|primitive)-/.test(src),
  },
  {
    id: 'has-typed-props',
    label: 'Exports a typed Props interface or type',
    test: (src) => /\bexport\s+(interface|type)\s+\w*Props\b/.test(src),
  },
  {
    id: 'has-export',
    label: 'Has at least one `export` statement',
    test: (src) => /\bexport\b/.test(src),
  },
];

/**
 * Pure: run the 4-check checklist against a source string.
 *
 * @param {string} source
 * @returns {{ checks: Array<{ id: string, label: string, pass: boolean }>, pass: number, total: number }}
 */
export function runPromotionChecklist(source) {
  const checks = CHECKS.map((c) => ({
    id: c.id,
    label: c.label,
    pass: c.test(source),
  }));
  return {
    checks,
    pass: checks.filter((c) => c.pass).length,
    total: checks.length,
  };
}

/** @param {ReturnType<typeof runPromotionChecklist>} result */
export function summarize(result, name) {
  const { pass, total, checks } = result;
  if (pass === total) return `${name}: ${pass}/${total} checks pass — ready to promote.`;
  const fails = checks.filter((c) => !c.pass).map((c) => c.id);
  return `${name}: ${pass}/${total} checks pass — fails: ${fails.join(', ')}`;
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    process.stderr.write('promote-to-core: component slug required\n');
    process.exit(1);
  }
  const src = path.join(LAB_DIR, `${slug}.tsx`);
  const dst = path.join(CORE_DIR, `${slug}.tsx`);
  if (!(await exists(src))) {
    process.stderr.write(`promote-to-core: not found: ${path.relative(REPO_ROOT, src)}\n`);
    process.exit(1);
  }
  const source = await readFile(src, 'utf8');
  const result = runPromotionChecklist(source);
  process.stdout.write(summarize(result, slug) + '\n');
  for (const c of result.checks) {
    process.stdout.write(`  [${c.pass ? '✓' : '✗'}] ${c.id} — ${c.label}\n`);
  }
  if (result.pass < result.total) {
    process.stdout.write('\nNot promoted. Fix the failing checks and re-run.\n');
    process.exit(1);
  }
  if (await exists(dst)) {
    process.stderr.write(
      `promote-to-core: refusing to overwrite existing ${path.relative(REPO_ROOT, dst)}\n`,
    );
    process.exit(1);
  }
  await writeFile(dst, source, 'utf8');
  process.stdout.write(`\nPromoted to ${path.relative(REPO_ROOT, dst)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`promote-to-core: ${err?.message ?? err}\n`);
    process.exit(1);
  });
}
