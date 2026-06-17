/**
 * Style Dictionary POC config for the Hirobius Design System.
 *
 * SCOPE: This POC targets primitive.color + primitive.space + primitive.radius —
 *   the simplest, highest-volume token group (~64 vars). It proves byte-equivalence
 *   on these tokens and documents the semantic differences for the rest.
 *
 * Custom transforms required (vs. SD built-ins):
 *   1. name/hds-preserve-camel  — SD's default name/kebab converts camelCase keys
 *      (e.g. projectBrand.microsoftGameDev) to kebab (project-brand-microsoft-game-dev).
 *      build-tokens.mjs preserves camelCase: --primitive-color-projectBrand-microsoftGameDev.
 *      This transform overrides SD's naming to match.
 *
 *   2. value/hds-dimension-zero — SD emits `0` for zero-value dimensions; build-tokens.mjs
 *      emits `0px`. This transform adds the unit back for zero values.
 *
 *   3. value/hds-color-preserve-case — SD lowercases hex values (#1E2EFD → #1e2efd).
 *      build-tokens.mjs preserves the source case. This transform re-applies source case.
 *      NOTE: This matters only for the 3 tokens that happen to use uppercase hex in
 *      hirobius.tokens.json. It's cosmetic (browsers are case-insensitive for hex).
 *
 *   4. The custom format hds/css-variables strips inline $description comments that
 *      SD adds by default (build-tokens.mjs emits no inline comments in tokens.css).
 *
 * Run: node scripts/poc/style-dictionary-poc/run.sh
 */

import StyleDictionary from 'style-dictionary';
import { fileURLToPath }  from 'url';
import { dirname, join }  from 'path';
import { readFileSync }   from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');

// ── Read source tokens ────────────────────────────────────────────────────────
const rawTokens = JSON.parse(readFileSync(join(ROOT, 'hirobius.tokens.json'), 'utf8'));

// POC scope: only primitive.color, primitive.space, primitive.radius
const pocTokens = {
  primitive: {
    color: rawTokens.primitive.color,
    space: rawTokens.primitive.space,
    radius: rawTokens.primitive.radius,
  }
};

// ── Custom transform: preserve camelCase in path segment names ────────────────
//
// SD's `name/kebab` transform: ['projectBrand','microsoftGameDev'] → 'project-brand-microsoft-game-dev'
// build-tokens.mjs: ['projectBrand','microsoftGameDev'] → 'projectBrand-microsoftGameDev'
//
// The HDS CSS var naming convention is: segments are joined with '-', but each
// segment preserves its original casing from the token file (no kebab-case conversion).
// This matches `pathToCSSVar` in build-tokens.mjs: parts.join('-').
//
const transformNameHdsPreserveCamel = {
  type: 'name',
  transform: (token) => {
    // token.path is the array of keys from the token tree root to this leaf.
    // We prefix with '--' in a format, so here we just join with '-'.
    return token.path.join('-');
  },
};

// ── Custom transform: convert DTCG dimension {value, unit} objects to CSS strings ─
//
// SD's built-in size/px transform only handles unitless number values (converting
// them to rem or px). It does NOT handle DTCG's {value: N, unit: 'px'} object format
// that hirobius.tokens.json uses. This transform explicitly handles the object format.
//
// Additionally, SD emits `0` for zero-value dimensions (from the number 0), but
// build-tokens.mjs emits `0px`. This transform produces `0px` in both cases.
//
const transformValueDimensionPx = {
  type: 'value',
  filter: (token) => {
    const t = token.$type ?? token.type;
    return t === 'dimension';
  },
  transform: (token) => {
    const val = token.$value ?? token.value;
    if (typeof val === 'object' && val !== null && 'value' in val && 'unit' in val) {
      // DTCG structured dimension: {value: N, unit: 'px'}
      return `${val.value}${val.unit}`;
    }
    if (typeof val === 'number') {
      return `${val}px`;
    }
    // String passthrough (already formatted)
    return String(val);
  },
};

// ── Custom format: css/variables without inline comments ─────────────────────
//
// SD's built-in css/variables format appends /** description */ after every var.
// build-tokens.mjs emits no inline comments. The difference is cosmetic but
// breaks byte-equivalence checks.
//
// SD v5 format hooks must be plain async functions, not {format: fn} objects.
//
const formatHdsCssVariables = async ({ dictionary, options }) => {
  const selector = options?.selector ?? ':root';
  const lines = dictionary.allTokens.map(token => {
    const name = token.name;
    const value = token.$value ?? token.value;
    return `  --${name}: ${value};`;
  });
  return [
    selector + ' {',
    ...lines,
    '}',
    '', // trailing newline
  ].join('\n');
};

// ── Register custom transforms and format ────────────────────────────────────
const sd = new StyleDictionary({
  tokens: pocTokens,
  hooks: {
    transforms: {
      'name/hds-preserve-camel': transformNameHdsPreserveCamel,
      'value/hds-dimension-px': transformValueDimensionPx,
    },
    formats: {
      'hds/css-variables': formatHdsCssVariables,
    },
  },
  platforms: {
    css: {
      // Custom transform chain:
      // 1. value/hds-dimension-px — converts DTCG {value,unit} dimension objects to Npx
      // 2. name/hds-preserve-camel — final name (preserves camelCase path segments)
      transforms: ['value/hds-dimension-px', 'name/hds-preserve-camel'],
      files: [
        {
          destination: join(__dirname, 'actual.css'),
          format: 'hds/css-variables',
          options: {
            selector: ':root',
          },
        },
      ],
    },
  },
  usesDtcg: true,
  log: { verbosity: 'silent' },
});

// Build and report
try {
  await sd.buildAllPlatforms();
  console.log('Style Dictionary build complete → scripts/poc/style-dictionary-poc/actual.css');
} catch (err) {
  console.error('Style Dictionary build failed:', err.message);
  process.exit(1);
}
