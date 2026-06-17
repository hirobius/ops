#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * Hirobius Design System — Token Pipeline Verifier
 *
 * Verifies that hirobius.tokens.json compiles correctly to:
 *   • tokens.css          — every JSON token has a CSS var; semantic vars reference upstream
 *   • generated-tokens.ts — every non-composite token has a TS var() reference
 *
 * Run AFTER pnpm tokens:  node scripts/verify-tokens.mjs
 * Or in one shot:         pnpm tokens && node scripts/verify-tokens.mjs
 *
 * Pure functions are exported so they can be unit-tested with Vitest.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname }            from 'path';
import { fileURLToPath }            from 'url';
import { pathToCSSVar, walkTokens, TYPO_PROPS, TYPO_OPTIONAL_KEYS, MOTION_PROPS, ELEVATION_SLOTS } from './build-tokens.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

// ── Composite expansion helpers ───────────────────────────────────────────────
/**
 * Returns the expected CSS sub-var names for a typography composite token.
 * Optional keys (e.g. maxWidth) are only emitted when the composite value
 * actually defines them — matching the behaviour of expandTypography in
 * build-tokens.mjs so verify-tokens does not flag absent optional vars as
 * missing.
 */
export function expandedTypoVars(path, value) {
  const base = pathToCSSVar(path);
  return TYPO_PROPS
    .filter(([, key]) => !TYPO_OPTIONAL_KEYS.has(key) || (value && value[key] != null))
    .map(([suffix]) => `${base}-${suffix}`);
}

/** Returns the expected CSS sub-var names for a transition composite token. */
export function expandedTransitionVars(path) {
  const base = pathToCSSVar(path);
  return [`${base}-duration`, `${base}-delay`, `${base}-timing-function`];
}

/** Returns the expected CSS sub-var names for a motion composite token. */
export function expandedMotionVars(path) {
  const base = `--hds-motion-${path[2]}`;
  return MOTION_PROPS.map(([suffix]) => `${base}-${suffix}`);
}

/** Returns the expected CSS sub-var names for an elevation composite token. */
export function expandedElevationVars(path) {
  const base = pathToCSSVar(path);
  return ELEVATION_SLOTS.map((slot) => `${base}-${slot}`);
}

// ── Parse tokens.css → var map ────────────────────────────────────────────────
/**
 * Parses a tokens.css string into a Map of { varName → value }.
 * Captures ALL declarations (both :root and [data-theme="dark"]).
 * Keeps first occurrence so light-mode values are authoritative for alias checks.
 */
export function parseCSSVarMap(cssText) {
  const map = new Map();
  for (const m of cssText.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gm)) {
    const varName = m[1].trim();
    const value   = m[2].trim();
    if (!map.has(varName)) map.set(varName, value);
  }
  return map;
}

// ── Run checks ────────────────────────────────────────────────────────────────
/**
 * Runs all pipeline integrity checks against the parsed token data.
 *
 * @param {object} raw        - Parsed hirobius.tokens.json
 * @param {Map}    cssVarMap  - Result of parseCSSVarMap(cssText)
 * @param {string} tsText     - Contents of generated-tokens.ts
 * @returns {{ errors: string[], warnings: string[], checked: number, skipped: number, orphans: number }}
 */
export function runChecks(raw, cssVarMap, tsText) {
  const errors   = [];
  const warnings = [];
  let   checked  = 0;
  let   skipped  = 0;

  for (const { path, type, value, extensions } of walkTokens(raw)) {
    const cssVar = pathToCSSVar(path);
    const tier   = path[0]; // 'primitive' | 'semantic' | 'component'

    // Composites expand into multiple sub-vars — check each one
    if (type === 'typography') {
      for (const subVar of expandedTypoVars(path, value)) {
        if (!cssVarMap.has(subVar)) {
          errors.push(`MISSING_CSS_VAR  ${subVar}  (expanded from typography token ${cssVar})`);
        } else {
          checked++;
        }
      }
      skipped++;
      continue;
    }
    if (type === 'motion') {
      for (const subVar of expandedMotionVars(path)) {
        if (!cssVarMap.has(subVar)) {
          errors.push(`MISSING_CSS_VAR  ${subVar}  (expanded from motion token ${cssVar})`);
        } else {
          checked++;
        }
      }
      skipped++;
      continue;
    }
    if (type === 'transition') {
      for (const subVar of expandedTransitionVars(path)) {
        if (!cssVarMap.has(subVar)) {
          errors.push(`MISSING_CSS_VAR  ${subVar}  (expanded from transition token ${cssVar})`);
        } else {
          checked++;
        }
      }
      skipped++;
      continue;
    }
    if (type === 'elevation') {
      for (const subVar of expandedElevationVars(path)) {
        if (!cssVarMap.has(subVar)) {
          errors.push(`MISSING_CSS_VAR  ${subVar}  (expanded from elevation token ${cssVar})`);
        } else {
          checked++;
        }
      }
      skipped++;
      continue;
    }

    // ── Check 1: CSS var exists in tokens.css ──────────────────────────────────
    if (!cssVarMap.has(cssVar)) {
      errors.push(`MISSING_CSS_VAR  ${cssVar}`);
      continue;
    }

    const cssValue = cssVarMap.get(cssVar);

    // ── Check 2: Semantic/component tokens must alias upstream vars ─────────────
    // Exception: oklch() values are permitted — they are computed color functions
    // whose dark-mode overrides are handled via $extensions in the token JSON.
    // Shadow type is also exempt: semantic shadow tokens carry pre-composed
    // multi-layer CSS strings that internally reference --primitive-shadow-color
    // for alpha-tinted layers — no single primitive can express that shape.
    if (tier !== 'primitive' && type !== 'shadow') {
      const isAlias = cssValue.startsWith('var(--');
      const isOklch = cssValue.startsWith('oklch(');
      if (!isAlias && !isOklch) {
        errors.push(`NOT_ALIASED      ${cssVar}: "${cssValue}"  (${type} — semantic/component tokens must alias a primitive var or use oklch())`);
      } else if (isAlias) {
        // ── Check 3: Referenced var must exist ─────────────────────────────────
        const refVar = cssValue.replace(/^var\(/, '').replace(/\)$/, '').trim();
        if (!cssVarMap.has(refVar)) {
          errors.push(`BROKEN_ALIAS     ${cssVar} → ${refVar}  (target var not found in tokens.css)`);
        }
      }
    }

    // ── Check 2b: Semantic shadow strings must reference --primitive-shadow-color ─
    // Lightweight integrity check that shadow tokens haven't drifted to literal
    // hex/rgb fills — they should always tint via the shared primitive var.
    if (tier !== 'primitive' && type === 'shadow' && !/var\(--/.test(cssValue) && cssValue !== 'none') {
      errors.push(`SHADOW_NO_TINT_VAR  ${cssVar}: "${cssValue.slice(0, 60)}…"  (shadow must compose via var(--primitive-shadow-color) tints)`);
    }

    // ── Check 4: Dark mode override should reference an existing var ────────────
    const dark = extensions?.['com.hirobius.modes']?.dark;
    if (dark && typeof dark === 'string' && dark.startsWith('{')) {
      const darkCSSVar = '--' + dark.replace(/^\{|\}$/g, '').replace(/\./g, '-');
      if (!cssVarMap.has(darkCSSVar)) {
        warnings.push(`DARK_MODE_ALIAS  ${cssVar} dark override → ${darkCSSVar}  (target not found)`);
      }
    }

    // ── Check 5: generated-tokens.ts must reference this CSS var ───────────────
    if (!tsText.includes(`"var(${cssVar})"`)) {
      warnings.push(`MISSING_TS_REF   ${cssVar}  (not found in generated-tokens.ts)`);
    }

    checked++;
  }

  // ── Check 6: No orphaned CSS vars (in CSS but not in JSON) ───────────────────
  const jsonVars = new Set(
    [...walkTokens(raw)]
      .filter(({ type }) => type !== 'typography' && type !== 'transition' && type !== 'motion' && type !== 'elevation')
      .map(({ path }) => pathToCSSVar(path))
  );
  for (const { path, type, value } of walkTokens(raw)) {
    if (type === 'typography') expandedTypoVars(path, value).forEach(v => jsonVars.add(v));
    if (type === 'motion') expandedMotionVars(path).forEach(v => jsonVars.add(v));
    if (type === 'transition')  expandedTransitionVars(path).forEach(v => jsonVars.add(v));
    if (type === 'elevation')   expandedElevationVars(path).forEach(v => jsonVars.add(v));
  }

  let orphans = 0;
  for (const v of cssVarMap.keys()) {
    if (!jsonVars.has(v)) {
      warnings.push(`ORPHANED_CSS_VAR ${v}  (in tokens.css but no matching JSON token)`);
      orphans++;
    }
  }

  return { errors, warnings, checked, skipped, orphans };
}

// ── CLI ───────────────────────────────────────────────────────────────────────
function loadFile(path, label) {
  if (!existsSync(path)) {
    console.error(`✗ ${label} not found at ${path}`);
    console.error('  Run: pnpm tokens first');
    process.exit(1);
  }
  return readFileSync(path, 'utf8');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const raw      = JSON.parse(loadFile(join(ROOT, 'hirobius.tokens.json'), 'hirobius.tokens.json'));
  const cssText  = loadFile(join(ROOT, 'src', 'styles', 'tokens.css'), 'tokens.css');
  const tsText   = loadFile(join(ROOT, 'src', 'app', 'design-system', 'generated-tokens.ts'), 'generated-tokens.ts');

  const cssVarMap = parseCSSVarMap(cssText);
  const { errors, warnings, checked, skipped, orphans } = runChecks(raw, cssVarMap, tsText);

  console.log('\nHirobius Token Pipeline Verifier');
  console.log('═'.repeat(48));
  console.log(`  Tokens checked:  ${checked}`);
  console.log(`  Composites:      ${skipped} (expanded inline)`);
  console.log(`  CSS vars parsed: ${cssVarMap.size}`);
  console.log(`  Orphaned vars:   ${orphans}`);
  console.log('');

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✓ All checks passed — pipeline is clean.\n');
    process.exit(0);
  }

  if (errors.length > 0) {
    console.log(`✗ ${errors.length} ERROR(S):`);
    errors.forEach(e => console.log(`  • ${e}`));
    console.log('');
  }

  if (warnings.length > 0) {
    console.log(`⚠  ${warnings.length} WARNING(S):`);
    warnings.forEach(w => console.log(`  • ${w}`));
    console.log('');
  }

  if (errors.length > 0) {
    console.error('Pipeline verification FAILED.\n');
    process.exit(1);
  } else {
    console.log('Pipeline verified with warnings.\n');
    process.exit(0);
  }
}
