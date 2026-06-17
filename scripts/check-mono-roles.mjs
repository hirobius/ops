/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-mono-roles.mjs
 *
 * Prevents ornamental/raw monospace from creeping back into prose-heavy surfaces
 * that should rely on InlineCode or normal body/caption styling instead.
 *
 * Scope is intentionally narrow: pages already cleaned and documented as prose-first.
 * Data tables, token docs, code blocks, inspectors, and demo surfaces are checked elsewhere.
 *
 * Escape hatch: add `// font-ok: <reason>` on the offending line.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();

const PROSE_SURFACES = [
  'src/app/pages/hds/ColorPage.tsx',
  'src/app/pages/hds/LicensePage.tsx',
  'src/app/pages/hds/components/ActionsPage.tsx',
];

const FORBIDDEN_PATTERNS = [
  /fontFamily\s*:\s*hds\.monoFamily/,
  /className\s*=\s*["'`][^"'`]*\bfont-mono\b[^"'`]*["'`]/,
];

let violations = 0;

for (const rel of PROSE_SURFACES) {
  const file = join(ROOT, rel);
  const lines = readFileSync(file, 'utf8').split('\n');
  const fileExempt = lines.some((line) => /font-ok:/.test(line));

  if (fileExempt) continue;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/font-ok:/.test(line)) continue;
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) continue;

    for (const pattern of FORBIDDEN_PATTERNS) {
      if (!pattern.test(line)) continue;

      console.error(`✕ mono role drift  ${rel}:${i + 1}`);
      console.error(`    ${line.trim()}`);
      console.error('    → Use InlineCode for prose-adjacent technical references, or revert to normal body/caption styling.');
      violations++;
      break;
    }
  }
}

if (violations > 0) {
  console.error(`\n✕ check-mono-roles: ${violations} violation(s).\n`);
  process.exit(1);
}

console.log(`✓ check-mono-roles — prose surfaces are free of ornamental raw monospace`);
