#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * a11y-schema-check.mjs
 *
 * Validates the a11yRules schema in public/hds-manifest.json against the
 * WCAG 2.1 AA baseline defined in docs/ai/AGENT_GUIDELINES.md.
 *
 * Checks:
 *   1. Schema integrity — every a11yRules entry has `rule` (string) + `required` (boolean)
 *   2. Interactive component coverage — Actions, Inputs, Navigation, Overlays must
 *      have at least one required rule (WCAG 2.1 AA: SC 4.1.2 Name, Role, Value)
 *   3. Media component coverage — Display components with images must have alt-text rule
 *   4. Coverage report — prints summary of covered vs. missing categories
 *
 * Exit codes:
 *   0 — all checks pass
 *   1 — schema violations or required coverage gaps
 *
 * Usage: node scripts/a11y-schema-check.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MANIFEST_PATH = join(ROOT, 'public', 'hds-manifest.json');

// Categories that MUST have at least one required a11y rule (WCAG 2.1 AA coverage mandate)
const REQUIRED_COVERAGE_CATEGORIES = new Set(['Actions', 'Inputs', 'Navigation', 'Overlays']);

// Components with known exemptions (layout/utility/internal — no interactive a11y requirements)
const EXEMPT_COMPONENTS = new Set([
  'Divider',     // presentational only
  'Stack',       // layout primitive
  'Grid',        // layout primitive
  'Surface',        // layout primitive
  'Badge',       // static status indicator (no interaction)
  'HeadingStack', // typography layout
  'TextLockup',  // typography layout
]);

function loadManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (err) {
    console.error(`[a11y-schema-check] Cannot read ${MANIFEST_PATH}: ${err.message}`);
    process.exit(1);
  }
}

function validateRuleSchema(componentName, rules) {
  const violations = [];
  if (!Array.isArray(rules)) {
    violations.push(`${componentName}: a11yRules must be an array, got ${typeof rules}`);
    return violations;
  }
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (typeof rule !== 'object' || rule === null) {
      violations.push(`${componentName}.a11yRules[${i}]: must be an object`);
      continue;
    }
    if (typeof rule.rule !== 'string' || rule.rule.trim() === '') {
      violations.push(`${componentName}.a11yRules[${i}]: "rule" must be a non-empty string`);
    }
    if (typeof rule.required !== 'boolean') {
      violations.push(`${componentName}.a11yRules[${i}]: "required" must be a boolean`);
    }
  }
  return violations;
}

const manifest = loadManifest();
const componentSpecs = manifest.componentSpecs ?? {};

let schemaViolations = [];
let coverageGaps = [];

// ── 1. Schema integrity ───────────────────────────────────────────────────────

for (const [name, spec] of Object.entries(componentSpecs)) {
  if (!('a11yRules' in spec)) {
    // Missing a11yRules key entirely is not a schema violation — generate-manifest
    // emits an empty array by default; this catch is for corrupted manual edits.
    continue;
  }
  schemaViolations.push(...validateRuleSchema(name, spec.a11yRules));
}

// ── 2. Interactive coverage mandate ──────────────────────────────────────────

const coverageStats = {};
for (const cat of REQUIRED_COVERAGE_CATEGORIES) {
  coverageStats[cat] = { total: 0, covered: 0, missing: [] };
}

for (const [name, spec] of Object.entries(componentSpecs)) {
  const category = spec.category;
  if (!REQUIRED_COVERAGE_CATEGORIES.has(category)) continue;
  if (EXEMPT_COMPONENTS.has(name)) continue;
  if (spec.hidden) continue;

  const stats = coverageStats[category];
  stats.total += 1;

  const rules = spec.a11yRules ?? [];
  const hasRequiredRule = rules.some(r => r.required === true);

  if (hasRequiredRule) {
    stats.covered += 1;
  } else {
    stats.missing.push(name);
    coverageGaps.push(`${name} (${category}): no required WCAG AA rule — add at least one required rule to a11yDefaults in scripts/enrich-manifest.mjs`);
  }
}

// ── 3. Media component: alt-text coverage ────────────────────────────────────

for (const [name, spec] of Object.entries(componentSpecs)) {
  if (spec.category !== 'Display') continue;
  if (spec.hidden) continue;
  const rules = spec.a11yRules ?? [];
  const hasAltRule = rules.some(r =>
    typeof r.rule === 'string' &&
    (r.rule.toLowerCase().includes('alt') || r.rule.toLowerCase().includes('aria-label'))
  );
  // Only enforce for components whose name suggests they render images
  if (/Img|Image|Asset|Photo|Picture/i.test(name) && !hasAltRule) {
    coverageGaps.push(`${name} (Display): image component missing alt-text a11y rule — add rule covering alt attribute`);
  }
}

// ── 4. Report ─────────────────────────────────────────────────────────────────

const totalComponents = Object.keys(componentSpecs).length;
const withRules = Object.values(componentSpecs).filter(s => s.a11yRules && s.a11yRules.length > 0).length;

console.log('\na11y schema check summary:');
console.log(`  Components with a11yRules: ${withRules} / ${totalComponents}`);
for (const [cat, stats] of Object.entries(coverageStats)) {
  const pct = stats.total > 0 ? Math.round((stats.covered / stats.total) * 100) : 100;
  console.log(`  ${cat}: ${stats.covered}/${stats.total} covered (${pct}%)`);
}

if (schemaViolations.length > 0) {
  console.error('\n[FAIL] a11yRules schema violations:');
  for (const v of schemaViolations) {
    console.error(`  - ${v}`);
  }
}

if (coverageGaps.length > 0) {
  console.error('\n[FAIL] Required coverage gaps (WCAG 2.1 AA):');
  for (const g of coverageGaps) {
    console.error(`  - ${g}`);
  }
}

if (schemaViolations.length > 0 || coverageGaps.length > 0) {
  const total = schemaViolations.length + coverageGaps.length;
  console.error(`\n${total} issue(s) found. Run node scripts/enrich-manifest.mjs to apply defaults.\n`);
  process.exit(1);
}

console.log('\nOK — a11y schema valid, all required categories have WCAG 2.1 AA coverage.\n');
