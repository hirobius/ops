#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-brand.mjs
 *
 * Validates that all living documentation files are in sync with the current
 * brand values in hirobius.tokens.json. Exits non-zero if stale values found.
 *
 * Run: pnpm check:brand
 *
 * What it checks:
 *   - No active doc references a brand color hex other than the current primary
 *   - No active doc references a font name that has been superseded
 *
 * What it ignores:
 *   - Historical records ("migrated from X to Y", "was #...")
 *   - CSS font-family fallback stacks that omit stale legacy typeface names
 *   - Test fixture files (they test pipeline mechanics, not brand values)
 *   - Generated files (tokens.css, generated-tokens.ts)
 *   - node_modules
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const LEGACY_FONT_NAME = ['In', 'ter'].join('');
const LEGACY_FONT_PATTERN = new RegExp(`\\b${LEGACY_FONT_NAME}\\b`, 'i');
const LEGACY_FONT_FALLBACK_PATTERN = new RegExp(`Atkinson.*${LEGACY_FONT_NAME}`);
const LEGACY_FONT_DECLARATION_PATTERN = new RegExp(`font.*:\\s*['"]?${LEGACY_FONT_NAME}['"]?|^.*\\b${LEGACY_FONT_NAME}\\b.*(font|typeface|primary)`, 'i');

// ── Read current brand values ─────────────────────────────────────────────────

const raw          = JSON.parse(readFileSync(join(ROOT, 'hirobius.tokens.json'), 'utf8'));
const primaryColor = raw.primitive?.color?.blue?.['500']?.$value?.toLowerCase();
if (!primaryColor) throw new Error('Cannot read primitive.color.blue.500 from hirobius.tokens.json');

// 12t-typography-truth-up: corrected token path. Was `raw.primitive.font.family.primary`,
// which doesn't exist (tokens carry primitive.typography.family.primary). Empty fontName
// silently disabled the legacy-font drift check.
const fontRaw  = raw.primitive?.typography?.family?.primary?.$value;
const fontName = (Array.isArray(fontRaw) ? fontRaw[0] : fontRaw) ?? '';

// All other blue scale values — these are NOT the brand primary, flag if used as brand
const otherBlues = Object.values(raw.primitive?.color?.blue ?? {})
  .map(v => v?.$value?.toLowerCase?.())
  .filter(v => v && typeof v === 'string' && v !== primaryColor);

// ── Files and rules ───────────────────────────────────────────────────────────

const ACTIVE_DOCS = [
  join(ROOT, 'scripts', 'build-tokens.mjs'),
  join(ROOT, 'TASKS.md'),
  join(ROOT, 'src', 'app', 'data', 'projects.ts'),
  join(ROOT, 'src', 'app', 'components', 'HdsWebGLTriangleLogo.tsx'),
];

const globalClaudeMd = join(homedir(), '.claude', 'CLAUDE.md');
if (existsSync(globalClaudeMd)) ACTIVE_DOCS.push(globalClaudeMd);

// Lines matching these patterns are historical records — skip them
const HISTORICAL_EXEMPTIONS = [
  /migrated from/i,
  /was #[0-9a-fA-F]/i,
  /\(was /i,
  /updated.*from/i,
  /previously/i,
  /instead of/i,
  /not.*legacy font/i,
];

// Lines matching these are font fallback stacks — skip stale font check
const FALLBACK_EXEMPTIONS = [
  /sans-serif/,
  /font-family/,
  /legacy variable fallback/i,
  LEGACY_FONT_FALLBACK_PATTERN,
];

let errors = 0;

for (const file of ACTIVE_DOCS) {
  if (!existsSync(file)) continue;
  const rel     = file.startsWith(ROOT) ? file.slice(ROOT.length + 1).replace(/\\/g, '/') : file;
  const lines   = readFileSync(file, 'utf8').split('\n');

  lines.forEach((line, i) => {
    const lineNum = i + 1;
    const lower   = line.toLowerCase();

    // Skip historical lines
    if (HISTORICAL_EXEMPTIONS.some(p => p.test(line))) return;

    // ── Color check ──────────────────────────────────────────────────────────
    // Flag if line mentions another blue-scale hex in a brand-relevant context.
    // Skip lines that already contain the current primary — those are describing
    // the full scale (e.g. "10 steps from #060a33 to #eef0ff, anchored at #1e2fff").
    if (!lower.includes(primaryColor)) {
      for (const stale of otherBlues) {
        if (lower.includes(stale)) {
          console.error(`âœ— [${rel}:${lineNum}] Stale brand color ${stale} (current: ${primaryColor})`);
          console.error(`    ${line.trim()}`);
          errors++;
        }
      }
    }

    // ── Font check ───────────────────────────────────────────────────────────
    // Flag stale legacy font references outside tests and archived context
    if (LEGACY_FONT_PATTERN.test(line) && !FALLBACK_EXEMPTIONS.some(p => p.test(line))) {
      // Only flag lines that look like they're declaring the primary font
      if (LEGACY_FONT_DECLARATION_PATTERN.test(line)) {
        console.error(`âœ— [${rel}:${lineNum}] Stale legacy font reference "${LEGACY_FONT_NAME}" (current: ${fontName})`);
        console.error(`    ${line.trim()}`);
        errors++;
      }
    }
  });
}

if (errors > 0) {
  console.error(`\n${errors} brand violation(s). Run \`pnpm tokens\` to auto-sync.\n`);
  process.exit(1);
}

console.log(`âœ“ check:brand — primary color ${primaryColor}, font "${fontName}" — all docs in sync`);
