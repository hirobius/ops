/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * audit-pages.mjs
 *
 * Token compliance auditor for page surfaces.
 * This is intentionally looser than audit-components.mjs:
 *
 * - reusable components must be strict
 * - pages must still avoid raw design values, but can keep justified editorial layout
 *
 * Usage: pnpm tokens:audit:pages
 * Exemption: // audit-ok: <reason>
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.cwd();
const SCAN_DIR = join(ROOT, 'src/app/pages');
const SKIP_DIRS = new Set(['figma', 'sketches', 'demos']);
const SKIP_FILES = new Set([
  'TokenCascadeDiagram.tsx',
]);

const CHECKS = [
  {
    name: 'Hardcoded hex color',
    test: (line) =>
      /(?::\s*|=\s*|,\s*|\(\s*)['"`]#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/.test(line) &&
      !line.includes('var(--') &&
      !line.includes('${'),
    fix: 'Use a semantic or component token-driven color value',
  },
  {
    name: 'Hardcoded rgba/rgb string literal',
    test: (line) => /['"`]rgba?\s*\(\s*\d/.test(line),
    fix: 'Use token-driven surface, border, or text color values',
  },
  {
    name: 'Hardcoded hsl/hsla string literal',
    test: (line) => /['"`]hsla?\s*\(\s*\d/.test(line),
    fix: 'Use token-driven color values instead of inline HSL',
  },
  {
    name: 'Hardcoded border-radius pixel value',
    test: (line) =>
      /borderRadius:\s*['"`]?\d+px/.test(line) &&
      !/(hds\.borderRadius\.|var\(--)/.test(line),
    fix: 'Use hds.borderRadius.* or a token-backed CSS variable',
  },
  {
    name: 'Raw transition duration',
    test: (line) =>
      /transition:/.test(line) &&
      /\b\d+\.?\d*(?:ms|s)\b/.test(line) &&
      !line.includes('hds.duration'),
    fix: 'Use hds.duration.* tokens for motion timing',
  },
];

function isComment(trimmed) {
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('/**')
  );
}

function scanDir(dir) {
  const files = [];

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);

    if (stat.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) {
        files.push(...scanDir(full));
      }
      continue;
    }

    if (SKIP_FILES.has(entry)) continue;
    if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      files.push(full);
    }
  }

  return files;
}

let totalViolations = 0;
const report = [];

for (const filePath of scanDir(SCAN_DIR)) {
  const rel = relative(ROOT, filePath).replace(/\\/g, '/');
  const lines = readFileSync(filePath, 'utf8').split('\n');
  const hits = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) continue;
    if (isComment(trimmed)) continue;
    if (trimmed.includes('// audit-ok')) continue;
    if (trimmed.includes('/* audit-ok')) continue;
    if (/\b(note|value|caption|description):\s*['"`]/.test(raw)) continue;
    if (raw.includes('getComputedStyle(')) continue;

    for (const check of CHECKS) {
      if (check.test(raw)) {
        hits.push({ lineNum: i + 1, text: trimmed, check });
      }
    }
  }

  if (hits.length > 0) {
    report.push({ file: rel, hits });
    totalViolations += hits.length;
  }
}

if (totalViolations === 0) {
  console.log('\n✓ Page token audit passed — no raw design values found on page surfaces.\n');
  process.exit(0);
}

console.error(`\n✗ Page token audit failed — ${totalViolations} violation(s) found.\n`);
console.error('  Fix the value, route it through tokens, or add // audit-ok: <reason> for an intentional editorial exception.\n');

for (const { file, hits } of report) {
  console.error(`  ${file}`);
  for (const { lineNum, text, check } of hits) {
    console.error(`    ${String(lineNum).padStart(4)}  [${check.name}]`);
    console.error(`          ${text}`);
    console.error(`          → ${check.fix}`);
  }
  console.error('');
}

process.exit(1);
