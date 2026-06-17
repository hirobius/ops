#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * Hirobius Design System — Quick Token Reference Builder
 *
 * Reads hirobius.tokens.json and extracts representative examples
 * from each semantic token category, generating a concise lookup table
 * for inclusion in public/llms.txt.
 *
 * Output format: markdown table with columns:
 *   Need | Token path examples | CSS var examples
 *
 * This prevents manual maintenance and keeps examples in sync with the
 * actual token structure.
 */

import { readFileSync } from 'fs';
import { join, dirname }               from 'path';
import { fileURLToPath }               from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Converts token path to CSS var name */
function tokenToCssVar(path) {
  return `--${path.replace(/\./g, '-')}`;
}

/** Extracts representative tokens from a semantic category */
function getExamples(semantic, category) {
  const tokens = [];
  const section = semantic[category];

  if (!section || typeof section !== 'object') return tokens;

  // Walk one level deep for concrete examples
  Object.entries(section).forEach(([key, value]) => {
    if (key.startsWith('$')) return;

    // For nested structures like surface.page, surface.raised
    if (value && typeof value === 'object' && '$value' in value) {
      tokens.push(`semantic.${category}.${key}`);
    } else if (value && typeof value === 'object') {
      // For deeper nesting like color.surface, color.content
      Object.keys(value).slice(0, 2).forEach(subkey => {
        if (!subkey.startsWith('$')) {
          tokens.push(`semantic.${category}.${key}.${subkey}`);
        }
      });
    }
  });

  return tokens;
}

// ── Build Reference ───────────────────────────────────────────────────────────

export function buildTokenQuickReference(tokensJsonPath) {
  const raw = JSON.parse(readFileSync(tokensJsonPath, 'utf-8'));
  const semantic = raw.semantic || {};

  const rows = [
    ['Need', 'Token path examples', 'CSS var examples'],
    ['---', '---', '---'],
  ];

  // Color surfaces
  const surfaces = getExamples(semantic, 'color')
    .filter(t => t.includes('surface'))
    .slice(0, 3);
  if (surfaces.length) {
    const cssVars = surfaces.map(tokenToCssVar).join(', ');
    const formatted = surfaces.map(t => `\`${t}\``).join(', ');
    const cssFormatted = cssVars.split(', ').map(v => `\`${v}\``).join(', ');
    rows.push(['Page/background surfaces', formatted, cssFormatted]);
  }

  // Text/content colors
  const content = getExamples(semantic, 'color')
    .filter(t => t.includes('content'))
    .slice(0, 3);
  if (content.length) {
    const cssVars = content.map(tokenToCssVar).join(', ');
    const formatted = content.map(t => `\`${t}\``).join(', ');
    const cssFormatted = cssVars.split(', ').map(v => `\`${v}\``).join(', ');
    rows.push(['Text/content colors', formatted, cssFormatted]);
  }

  // Borders
  const borders = getExamples(semantic, 'color')
    .filter(t => t.includes('border'))
    .slice(0, 3);
  if (borders.length) {
    const cssVars = borders.map(tokenToCssVar).join(', ');
    const formatted = borders.map(t => `\`${t}\``).join(', ');
    const cssFormatted = cssVars.split(', ').map(v => `\`${v}\``).join(', ');
    rows.push(['Borders/dividers', formatted, cssFormatted]);
  }

  // Feedback states
  const feedback = getExamples(semantic, 'color')
    .filter(t => t.includes('feedback'))
    .slice(0, 4);
  if (feedback.length) {
    const cssVars = feedback.map(tokenToCssVar).join(', ');
    const formatted = feedback.map(t => `\`${t}\``).join(', ');
    const cssFormatted = cssVars.split(', ').map(v => `\`${v}\``).join(', ');
    rows.push(['Feedback states', formatted, cssFormatted]);
  }

  // Spacing
  const spacing = getExamples(semantic, 'space')
    .slice(0, 3);
  if (spacing.length) {
    const formatted = spacing.map(t => `\`${t}\``).join(', ');
    rows.push(['Spacing (semantic tiers)', formatted, 'use semantic tokens or `--hds-space-px12` style vars']);
  }

  // Radius
  const radius = getExamples(semantic, 'radius')
    .slice(0, 1);
  if (radius.length) {
    const cssVars = radius.map(tokenToCssVar).join(', ');
    const formatted = radius.map(t => `\`${t}\``).join(', ');
    const cssFormatted = cssVars.split(', ').map(v => `\`${v}\``).join(', ');
    rows.push(['Radius', formatted, cssFormatted]);
  } else {
    rows.push(['Radius', '`semantic.radius.action`', '`--semantic-radius-action`']);
  }

  // Motion
  rows.push([
    'Motion',
    '`semantic.motion.productive`, `semantic.motion.expressive`, `semantic.motion.exit`',
    'use token refs; values are structured (duration/easing)'
  ]);

  // Typography
  rows.push([
    'Typography',
    '`semantic.typography.body`, `semantic.typography.h2`, `semantic.typography.caption`',
    'use token refs; values are structured (family/size/weight/etc)'
  ]);

  // Format as markdown table
  return rows.map(row => `| ${row.join(' | ')} |`).join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

const tokensPath = join(ROOT, 'hirobius.tokens.json');
const table = buildTokenQuickReference(tokensPath);

console.log('Quick Token Reference Table:');
console.log('');
console.log(table);
console.log('');
console.log('To integrate into llms.txt, insert after "## Quick Token Reference"');
