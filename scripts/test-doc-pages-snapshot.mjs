#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/test-doc-pages-snapshot.mjs
 *
 * 9d-10: Visual-regression baseline for the doc-site source surface.
 *
 * The 9-D cluster batch-refactored every doc page to ride a single
 * canonical chrome (DocShell + DocPageHeader + CodeBlock +
 * HeadingAnchor + ApiReference). This script locks the post-9-D
 * known-good shape: it walks every `.tsx` under
 * `src/app/pages/docs/{patterns,templates}/` and projects each file into
 * a canonical, key-sorted JSON record (path, byte length, content hash,
 * sorted import set, exported component identifiers). The aggregate
 * snapshot is committed to `fixtures/doc-pages/snapshot.json`. Any
 * future change to a doc page surfaces as a snapshot diff and is a hard
 * pretest fail until either (a) the change is reverted or (b) the
 * baseline is intentionally re-rolled with `--update`.
 *
 * Mirrors the shape of `scripts/test-figma-masters-snapshot.mjs` (8v-6):
 * recursive key-sort + canonicalize + diff vs baseline + `--update`
 * mode for re-baselining. Doc pages are React .tsx (not pure JSON-
 * projection like the figma-masters pipeline), so we project each file
 * to a deterministic metadata record rather than running the full DOM —
 * the AST-shape projection is sufficient to catch unintended drift in
 * imports / exported identifiers / file content while staying purely
 * Node-side (no browser, no Vite SSR) and therefore safe in pretest.
 *
 * Usage:
 *   node scripts/test-doc-pages-snapshot.mjs            # diff vs baseline
 *   node scripts/test-doc-pages-snapshot.mjs --update   # write baseline
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_ROOT = path.join(ROOT, 'src/app/pages/docs');
const SNAPSHOT_PATH = path.join(ROOT, 'fixtures/doc-pages/snapshot.json');
const UPDATE = process.argv.includes('--update');

// ── canonicalization (recursive key-sort) ─────────────────────────────────────

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = canonical(value[key]);
    return sorted;
  }
  return value;
}

function serialize(snapshot) {
  return JSON.stringify(canonical(snapshot), null, 2) + '\n';
}

// ── source projection ─────────────────────────────────────────────────────────

function listDocPages() {
  const out = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
        out.push(abs);
      }
    }
  }
  walk(DOCS_ROOT);
  // Stable order across platforms (case-sensitive, deterministic).
  return out.sort();
}

function normalizeContent(raw) {
  // Strip CRLF + trailing whitespace before hashing so checkouts on
  // different line-ending profiles don't trip the snapshot diff.
  return raw.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '\n');
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function extractImports(source) {
  // Captures the module specifier of every top-level `import … from '…';`
  // statement. Side-effect imports (`import 'foo';`) are also captured.
  const out = new Set();
  const re = /^\s*import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]\s*;?\s*$/gm;
  let m;
  while ((m = re.exec(source)) !== null) out.add(m[1]);
  return [...out].sort();
}

function extractExports(source) {
  // Captures the symbol names of `export default function Foo`,
  // `export function Foo`, `export const Foo`, `export default Foo;`.
  // Sufficient to lock the public surface of each doc-page module.
  const out = new Set();
  const patterns = [
    /export\s+default\s+function\s+([A-Za-z_$][\w$]*)/g,
    /export\s+function\s+([A-Za-z_$][\w$]*)/g,
    /export\s+const\s+([A-Za-z_$][\w$]*)/g,
    /export\s+default\s+([A-Za-z_$][\w$]*)\s*;?/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(source)) !== null) out.add(m[1]);
  }
  return [...out].sort();
}

function projectPage(absPath) {
  const raw = fs.readFileSync(absPath, 'utf8');
  const normalized = normalizeContent(raw);
  return {
    path: path.relative(ROOT, absPath).split(path.sep).join('/'),
    bytes: Buffer.byteLength(normalized, 'utf8'),
    sha256: sha256(normalized),
    imports: extractImports(normalized),
    exports: extractExports(normalized),
  };
}

function buildSnapshot() {
  const pages = listDocPages().map(projectPage);
  return {
    // Static metadata — the baselineCommit + baselineAt fields are
    // human-readable provenance only and intentionally NOT included in
    // the canonicalized diff (they live in `meta` which the reader can
    // see on either side of a re-baseline). The `pages` array is what
    // the snapshot regression actually locks.
    meta: {
      unit: '9d-10-doc-snapshot-lock-and-a11y',
      baselineCommit: '77d01a7c7e578da0edaf9f93da692e2dd89549c3',
      baselineAt: '2026-05-01T09:01:52Z',
      docsRoot: 'src/app/pages/docs',
      generator: 'scripts/test-doc-pages-snapshot.mjs',
    },
    pages,
  };
}

function summary(snapshot) {
  const totalBytes = snapshot.pages.reduce((sum, p) => sum + p.bytes, 0);
  return `${snapshot.pages.length} doc pages × ${totalBytes.toLocaleString()} normalized bytes`;
}

// ── main ──────────────────────────────────────────────────────────────────────

function main() {
  const snapshot = buildSnapshot();
  const out = serialize(snapshot);

  if (UPDATE || !fs.existsSync(SNAPSHOT_PATH)) {
    fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
    fs.writeFileSync(SNAPSHOT_PATH, out);
    console.log(
      `Wrote snapshot ${path.relative(ROOT, SNAPSHOT_PATH)} — ${summary(snapshot)}`,
    );
    return;
  }

  const expected = fs.readFileSync(SNAPSHOT_PATH, 'utf8');
  if (out === expected) {
    console.log(`OK — doc-pages match snapshot — ${summary(snapshot)}`);
    return;
  }

  console.error('✗ doc-pages output diverged from committed snapshot');
  console.error(`  baseline: ${path.relative(ROOT, SNAPSHOT_PATH)}`);
  console.error(`  current:  ${summary(snapshot)}`);
  console.error('  Re-run with --update to accept the new state if the change was intentional.');
  process.exit(1);
}

main();
