/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-token-structure.mjs
 *
 * Validates hirobius.tokens.json for structural correctness.
 * Catches two categories of architectural error:
 *
 * 1. Cross-tier aliasing — a token references a token in the wrong tier:
 *      semantic.*  must only alias primitive.*
 *      component.* must alias semantic.* or component.* (not primitive.* directly)
 *      primitive.* must not use aliases
 *
 * 2. Theme coverage gaps — a token with $extensions["com.figma.variables"].modes
 *    must define values for BOTH Light and Dark.
 *
 * No suppression mechanism. All violations require a structural fix in the JSON.
 */

import { readFileSync } from 'fs';
import { join , dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const ROOT        = join(__dirname, '..');
const TOKENS_FILE = join(ROOT, 'hirobius.tokens.json');

// Alias pattern: {path.to.token}
const ALIAS_RE = /^\{([^}]+)\}$/;

const violations = [];
const FORBIDDEN_TYPOGRAPHY_SUBTREES = new Set([
  'semantic.typography.docs',
  'semantic.typography.sidebar',
  'component.typography.sidebar',
]);

function getTier(path) {
  return path.split('.')[0]; // primitive | semantic | component
}

// Cross-tier aliasing is enforced for COLOR tokens only.
// Spacing, font, radius, layout, fontWeight: component → primitive is acceptable
// (industry standard — Material Design 3, IBM Carbon, Atlassian allow this for
// non-semantic properties that don't change between themes or densities).
// See ADR-009 in DECISIONS.md.
const COLOR_CROSS_TIER_TYPES = new Set(['color']);

function walkTokens(node, path, inheritedType = null) {
  if (typeof node !== 'object' || node === null) return;

  if (FORBIDDEN_TYPOGRAPHY_SUBTREES.has(path)) {
    violations.push({
      type: 'forbidden-subtree',
      path,
      fix: 'remove this subtree and use the core semantic typography ramp instead',
    });
    return;
  }

  // Track the effective $type — set at any level, inherited by children
  const effectiveType = node['$type'] ?? inheritedType;

  if ('$value' in node) {
    // This is a leaf token
    const value = node['$value'];
    const currentTier = getTier(path);

    // ── Cross-tier check (color only — see ADR-009) ───────────────────────
    if (COLOR_CROSS_TIER_TYPES.has(effectiveType)) {
      const aliasMatch = typeof value === 'string' && value.match(ALIAS_RE);
      if (aliasMatch) {
        const refPath = aliasMatch[1];
        const refTier = getTier(refPath);

        // semantic → semantic: lateral alias (forbidden)
        if (currentTier === 'semantic' && refTier === 'semantic') {
          violations.push({
            type: 'cross-tier',
            label: 'semantic → semantic (lateral alias)',
            path,
            ref: value,
            fix: `alias to a primitive token (e.g. {primitive.color.*})`,
          });
        }
        // component → primitive: skips semantic tier (forbidden for colors)
        if (currentTier === 'component' && refTier === 'primitive') {
          violations.push({
            type: 'cross-tier',
            label: 'component → primitive (skips semantic tier)',
            path,
            ref: value,
            fix: `route through a semantic color token (e.g. {semantic.color.*})`,
          });
        }
        // primitive color aliases: raw values only
        if (currentTier === 'primitive' && refTier !== 'primitive') {
          violations.push({
            type: 'cross-tier',
            label: 'primitive → non-primitive (primitives must be raw values)',
            path,
            ref: value,
            fix: `replace with a raw hex value`,
          });
        }
      }
    }

    // ── Theme coverage check ──────────────────────────────────────────────
    const ext = node['$extensions'];
    if (ext && ext['com.figma.variables'] && ext['com.figma.variables']['modes']) {
      const modes = ext['com.figma.variables']['modes'];
      if (!('Light' in modes)) {
        violations.push({
          type: 'coverage',
          path,
          missing: 'Light',
          fix: `add a Light mode value in $extensions["com.figma.variables"]["modes"]["Light"]`,
        });
      }
      if (!('Dark' in modes)) {
        violations.push({
          type: 'coverage',
          path,
          missing: 'Dark',
          fix: `add a Dark mode value in $extensions["com.figma.variables"]["modes"]["Dark"]`,
        });
      }
    }

    return; // leaf — don't recurse further
  }

  // Recurse into children (skip $ meta-keys), passing effective type down
  for (const key of Object.keys(node)) {
    if (key.startsWith('$')) continue;
    const childPath = path ? `${path}.${key}` : key;
    walkTokens(node[key], childPath, effectiveType);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
let tokens;
try {
  tokens = JSON.parse(readFileSync(TOKENS_FILE, 'utf-8'));
} catch (err) {
  console.error(`✗ check-token-structure — failed to parse hirobius.tokens.json: ${err.message}`);
  process.exit(1);
}

// Walk top-level tiers: primitive, semantic, component
for (const key of Object.keys(tokens)) {
  if (key.startsWith('$')) continue;
  walkTokens(tokens[key], key);
}

if (violations.length === 0) {
  console.log('✓ check-token-structure — no cross-tier alias violations or theme coverage gaps');
  process.exit(0);
} else {
  console.error(`\n✗ check-token-structure — ${violations.length} violation(s) found\n`);
  for (const v of violations) {
    if (v.type === 'cross-tier') {
      console.error(`  Cross-tier alias (${v.label}):`);
      console.error(`    ${v.path} → ${v.ref}`);
      console.error(`    Fix: ${v.fix}\n`);
    } else if (v.type === 'forbidden-subtree') {
      console.error('  Forbidden typography subtree:');
      console.error(`    ${v.path}`);
      console.error(`    Fix: ${v.fix}\n`);
    } else {
      console.error(`  Theme coverage gap:`);
      console.error(`    ${v.path} — missing ${v.missing} mode`);
      console.error(`    Fix: ${v.fix}\n`);
    }
  }
  process.exit(1);
}
