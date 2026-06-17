/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-page-shell.mjs
 *
 * Forbids direct Container usage in src/app/pages/**. Pages must use Page
 * (which wraps Container + applies the canonical vertical padding) so every
 * page lands with consistent breathing room against the viewport edges.
 *
 * Pages that legitimately need raw Container (full-bleed editorial layouts,
 * embedded canvases, etc.) can opt out with `// hds-page-shell-exempt: <reason>`
 * on the same line as the import.
 *
 * Usage: pnpm check:page-shell
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.cwd();
const SCAN_DIR = join(ROOT, 'src/app/pages');
const EXEMPT_MARKER = 'hds-page-shell-exempt';

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (full.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

const files = walk(SCAN_DIR);
const violations = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/import\s+\{[^}]*\bHdsContainer\b[^}]*\}\s+from/.test(line)) {
      if (line.includes(EXEMPT_MARKER)) continue;
      violations.push({ file: relative(ROOT, file), line: i + 1, text: line.trim() });
    }
  }
}

if (violations.length) {
  console.error('\n✗ Page-shell check failed: pages must use Page, not Container.\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.text}`);
  }
  console.error(`\nFix: replace Container with Page (src/app/components/Page.tsx).`);
  console.error(`Page = Container + standard top/bottom padding so content breathes against viewport edges.`);
  console.error(`If your page truly needs raw Container, add // ${EXEMPT_MARKER}: <reason> to the import line.\n`);
  process.exit(1);
}

console.log(`✓ Page-shell check: ${files.length} page files, all clean.`);
