#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-css-integrity.mjs
 *
 * Verifies that hand-authored bridge vars in theme.css stay in sync with
 * the token source of truth in hirobius.tokens.json.
 *
 * Checks:
 *   I1-I10  - legacy --hds-accent* / --hds-color-brand helpers alias semantic token vars
 *   I11     - --hds-color-brand-rgb matches RGB components of primitive.color.blue.500
 *   I12     - --hds-font-family includes primitive.typography.family.primary[0]
 *   I13     - --hds-font-mono includes primitive.typography.family.mono[0] (if var exists)
 *
 * Run: node scripts/check-css-integrity.mjs
 * Or via: pnpm check:css
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function hexToRGB(hex) {
  if (!hex || !hex.startsWith('#') || hex.length !== 7) return null;
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/** Extract the value of a CSS custom property from the first :root block. */
function extractRootVar(css, varName) {
  const rootMatch = css.match(/:root\s*\{([^}]+)\}/);
  if (!rootMatch) return null;
  const block = rootMatch[1];
  const re = new RegExp(`${varName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}\\s*:\\s*([^;]+);`);
  const match = block.match(re);
  return match ? match[1].trim() : null;
}

const raw = JSON.parse(readFileSync(join(ROOT, 'hirobius.tokens.json'), 'utf8'));
const css = readFileSync(join(ROOT, 'src', 'styles', 'theme.css'), 'utf8');

const errors = [];

const bridgeChecks = [
  ['I1', '--hds-accent', 'var(--semantic-accent-rest)'],
  ['I2', '--hds-accent-hover', 'var(--semantic-accent-hover)'],
  ['I3', '--hds-accent-pressed', 'var(--semantic-accent-pressed)'],
  ['I4', '--hds-accent-inactive', 'var(--semantic-accent-inactive)'],
  ['I5', '--hds-accent-disabled', 'var(--semantic-accent-disabled)'],
  ['I6', '--hds-accent-content', 'var(--semantic-accent-content)'],
  ['I7', '--hds-accent-content-hover', 'var(--semantic-accent-contentHover)'],
  ['I8', '--hds-accent-subtle', 'var(--semantic-accent-subtle)'],
  ['I9', '--hds-color-brand', 'var(--semantic-accent-rest)'],
  ['I10', '--hds-color-brand-pressed', 'var(--semantic-accent-pressed)'],
];

for (const [id, helper, expected] of bridgeChecks) {
  const actual = extractRootVar(css, helper);
  if (actual === null) {
    errors.push(`${id} ${helper}: theme.css is missing the helper bridge`);
    continue;
  }
  if (actual !== expected) {
    errors.push(`${id} ${helper}: theme.css has "${actual}", expected "${expected}"`);
  }
}

const brandHex = raw.primitive?.color?.blue?.['500']?.['$value'];
if (brandHex) {
  const rgb = hexToRGB(brandHex);
  if (rgb) {
    const expectedRGB = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
    const actualRGB = extractRootVar(css, '--hds-color-brand-rgb');
    if (actualRGB !== null) {
      const normalized = actualRGB.replace(/\s+/g, ' ').trim();
      if (normalized !== expectedRGB) {
        errors.push(`I11 --hds-color-brand-rgb: theme.css has "${normalized}", token expects "${expectedRGB}" (from ${brandHex})`);
      }
    }
  } else {
    errors.push(`I11 primitive.color.blue.500 value "${brandHex}" is not a 6-digit hex`);
  }
} else {
  errors.push('I11 primitive.color.blue.500 not found in hirobius.tokens.json');
}

const primaryFontArr = raw.primitive?.typography?.family?.primary?.['$value'];
if (Array.isArray(primaryFontArr) && primaryFontArr.length > 0) {
  const firstFont = primaryFontArr[0];
  const actualFam = extractRootVar(css, '--hds-font-family');
  if (actualFam !== null && !actualFam.includes(firstFont)) {
    errors.push(`I12 --hds-font-family: theme.css does not lead with "${firstFont}" (primary font from token)`);
  }
} else {
  errors.push('I12 primitive.typography.family.primary not found or not an array in hirobius.tokens.json');
}

const monoFontArr = raw.primitive?.typography?.family?.mono?.['$value'];
if (Array.isArray(monoFontArr) && monoFontArr.length > 0) {
  const firstMono = monoFontArr[0];
  const actualMono = extractRootVar(css, '--hds-font-mono');
  if (actualMono !== null && !actualMono.includes(firstMono)) {
    errors.push(`I13 --hds-font-mono: theme.css does not include "${firstMono}" (mono font from token)`);
  }
}

if (errors.length > 0) {
  console.error('\nCSS integrity check failed:\n');
  errors.forEach((error) => console.error(`  ${error}`));
  console.error('\nFix the drift between theme.css and hirobius.tokens.json.\n');
  process.exit(1);
} else {
  console.log('[ok] CSS integrity - theme.css bridge vars match token values');
}
