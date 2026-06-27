/**
 * scripts/lib/source-scanner.mjs — the shared source-file scanner for the
 * check-*.mjs gates.
 *
 * Owns the plumbing that ~30 check scripts each re-implemented: walk the roots,
 * skip the skip-dirs, filter by extension, honour fixture-mode (HDS_FIXTURE_MODE /
 * --fixture-mode + FIXTURE_FILE), read each file and split into lines, then hand
 * them to a rule-specific `check(lines, rel, push)` callback. The rule (its regex /
 * matching / suppression markers) stays at the call site; the scaffolding lives
 * here once. (Candidate #10.)
 *
 * Returns the accumulated violations (whatever the check pushes).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function collect(dir, exts, skip, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (skip.has(entry)) continue;
      collect(full, exts, skip, out);
    } else if (exts.has(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * @param {object} opts
 * @param {string[]} opts.roots        Absolute dirs to walk.
 * @param {string[]} opts.extensions   File extensions to include (e.g. ['.ts', '.tsx']).
 * @param {string[]} [opts.skipDirs]   Directory names to skip.
 * @param {(lines: string[], rel: string, push: (v: any) => void) => void} opts.check
 * @returns {any[]} the violations the check pushed.
 */
export function scanFiles({ roots, extensions, skipDirs = [], check }) {
  const exts = new Set(extensions);
  const skip = new Set(skipDirs);
  const violations = [];
  const push = (v) => violations.push(v);

  const fixtureMode =
    process.argv.includes('--fixture-mode') || process.env.HDS_FIXTURE_MODE === '1';
  const fixtureFile = process.env.FIXTURE_FILE;

  const files =
    fixtureMode && fixtureFile
      ? [resolve(fixtureFile)]
      : roots.flatMap((r) => collect(r, exts, skip, []));

  for (const file of files) {
    const rel = relative(ROOT, file);
    const lines = readFileSync(file, 'utf8').split('\n');
    check(lines, rel, push);
  }
  return violations;
}
