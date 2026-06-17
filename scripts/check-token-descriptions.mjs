/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-token-descriptions.mjs — merged gate (13z-6)
 *
 * Merged from: check-token-descriptions.mjs + check-token-description-quality.mjs
 *
 * Default mode:
 *   Enforces token description quality in hirobius.tokens.json:
 *     - Every $type-bearing token node SHOULD have a "$description" field.
 *     - No description may be blank or whitespace-only.
 *     - No description may exceed MAX_WORDS words.
 *
 * With --quality flag (also runs quality checks on generated descriptions):
 *   Additionally scans src/app/design-system/generated-token-descriptions.ts:
 *     - No empty descriptions.
 *     - No generic fallback text.
 *     - No one-sided theming language (only "darken" without "lighten", etc.).
 *
 * Exits 0 on pass, 1 on violations.
 *
 * Usage:
 *   pnpm check:token-descriptions  OR  node scripts/check-token-descriptions.mjs
 *   node scripts/check-token-descriptions.mjs --max-words 15   (override limit)
 *   node scripts/check-token-descriptions.mjs --no-missing     (skip missing-description check)
 *   node scripts/check-token-descriptions.mjs --quality        (also check generated-token-descriptions.ts)
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DESCRIPTION_FILE = join(ROOT, 'src', 'app', 'design-system', 'generated-token-descriptions.ts');

// Parse CLI flags
const args = process.argv.slice(2);

const isFixtureMode = args.includes('--fixture-mode') || process.env.HDS_FIXTURE_MODE === '1';
const fixtureFile = process.env.FIXTURE_FILE;
const TOKENS_FILE = isFixtureMode && fixtureFile ? resolve(fixtureFile) : join(ROOT, 'hirobius.tokens.json');
const maxWordsArg = args.indexOf('--max-words');
const MAX_WORDS = maxWordsArg >= 0 ? parseInt(args[maxWordsArg + 1], 10) : 20;
const CHECK_MISSING = !args.includes('--no-missing');
const CHECK_QUALITY = args.includes('--quality');

/**
 * Walk the token tree and collect leaf token nodes (those with $value or $type
 * at the same level, or group nodes with $description).
 * Returns [{path, description, hasValue}].
 */
function collectTokenNodes(obj, pathParts = []) {
  const results = [];
  if (typeof obj !== 'object' || obj === null) return results;

  const keys = Object.keys(obj);
  const hasValue = keys.includes('$value');
  const hasDescription = keys.includes('$description');
  const desc = hasDescription ? obj['$description'] : null;

  // Leaf-level token: has $value
  if (hasValue) {
    results.push({
      path: pathParts.join('.'),
      description: desc,
      isLeaf: true,
    });
  }

  // Group node with $type but no $value (e.g. the group declares $type for children)
  if (!hasValue && hasDescription && pathParts.length > 0) {
    results.push({
      path: pathParts.join('.'),
      description: desc,
      isLeaf: false,
    });
  }

  // Recurse into non-DTCG keys
  for (const key of keys) {
    if (key.startsWith('$')) continue;
    const child = obj[key];
    if (typeof child === 'object' && child !== null && !Array.isArray(child)) {
      results.push(...collectTokenNodes(child, [...pathParts, key]));
    }
  }

  return results;
}

// ─── Mode 1: Token source of truth checks (hirobius.tokens.json) ─────────────

let tokens;
try {
  tokens = JSON.parse(readFileSync(TOKENS_FILE, 'utf-8'));
} catch (e) {
  console.error(`✗ check-token-descriptions — could not read ${TOKENS_FILE}: ${e.message}`);
  process.exit(1);
}

const nodes = collectTokenNodes(tokens);
const violations = [];

for (const { path, description, isLeaf } of nodes) {
  // Only check leaf tokens for missing descriptions (groups are optional)
  if (CHECK_MISSING && isLeaf && (description === null || description === undefined)) {
    violations.push({ path, kind: 'missing', description: null });
    continue;
  }

  if (description !== null && description !== undefined) {
    // Blank check
    if (typeof description !== 'string' || description.trim() === '') {
      violations.push({ path, kind: 'blank', description });
      continue;
    }

    // Length check
    const wordCount = description.trim().split(/\s+/).length;
    if (wordCount > MAX_WORDS) {
      violations.push({ path, kind: 'verbose', description, wordCount });
    }
  }
}

// ─── Mode 2: Generated descriptions quality check (--quality flag) ────────────

const qualityFailures = [];

if (CHECK_QUALITY) {
  const themeRelativePattern = /\b(darken(?:s|ed)?|lighten(?:s|ed)?|brighten(?:s|ed)?|dim(?:s|med)?|darkens?|lightens?)\b/i;
  const themePairPattern = /\blight\b[\s\S]*\bdark\b|\bdark\b[\s\S]*\blight\b/i;
  const genericPattern = /^(No token description available\.?|Primitive source value\.|Semantic role token\.|Design token source value\.|Specific value within the .* range at a defined lightness step\.|Discrete values within the .* range at defined lightness steps\.)$/i;

  function unescapeString(value) {
    return value.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }

  function extractDescriptions(source) {
    const rows = [];
    const lines = source.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const match = line.match(/^\s*"((?:\\.|[^"])*)":\s*"((?:\\.|[^"])*)",?\s*$/);
      if (!match) continue;
      rows.push({
        line: index + 1,
        tokenPath: unescapeString(match[1]),
        description: unescapeString(match[2]),
      });
    }
    return rows;
  }

  if (!existsSync(DESCRIPTION_FILE)) {
    console.warn(`⚠ check-token-descriptions --quality: ${DESCRIPTION_FILE} not found, skipping quality checks.`);
  } else {
    const source = readFileSync(DESCRIPTION_FILE, 'utf8');
    const rows = extractDescriptions(source);

    for (const row of rows) {
      const cleaned = row.description.replace(/\s+/g, ' ').trim();
      if (!cleaned) {
        qualityFailures.push(`[${row.line}] ${row.tokenPath} has an empty description.`);
        continue;
      }

      if (genericPattern.test(cleaned)) {
        qualityFailures.push(`[${row.line}] ${row.tokenPath} uses a generic fallback description: ${cleaned}`);
        continue;
      }

      if (themeRelativePattern.test(cleaned) && !themePairPattern.test(cleaned)) {
        qualityFailures.push(`[${row.line}] ${row.tokenPath} uses one-sided theming language: ${cleaned}`);
      }
    }
  }
}

// ─── Report ──────────────────────────────────────────────────────────────────

const hasViolations = violations.length > 0;
const hasQualityFailures = qualityFailures.length > 0;

if (!hasViolations && !hasQualityFailures) {
  const leafCount = nodes.filter(n => n.isLeaf).length;
  const qualityMsg = CHECK_QUALITY ? '; generated-token-descriptions.ts quality OK' : '';
  console.log(`✓ check-token-descriptions — ${leafCount} leaf tokens, all descriptions valid (max ${MAX_WORDS} words)${qualityMsg}`);
  process.exit(0);
}

if (hasViolations) {
  console.error(`\n✗ check-token-descriptions — ${violations.length} violation(s) found (max ${MAX_WORDS} words)\n`);
  for (const v of violations) {
    if (v.kind === 'missing') {
      console.error(`  MISSING  ${v.path}`);
    } else if (v.kind === 'blank') {
      console.error(`  BLANK    ${v.path}`);
    } else {
      console.error(`  VERBOSE  ${v.path}  (${v.wordCount}w > ${MAX_WORDS}w)`);
      console.error(`           "${v.description.slice(0, 100)}${v.description.length > 100 ? '...' : ''}"`);
    }
  }
  console.error('');
}

if (hasQualityFailures) {
  console.error('\nToken description quality check failed:\n');
  qualityFailures.slice(0, 40).forEach((failure) => console.error(`  ${failure}`));
  if (qualityFailures.length > 40) {
    console.error(`  ...and ${qualityFailures.length - 40} more.`);
  }
  console.error('\nDescriptions should explain the token in context without one-sided theme language or generic fallback text.\n');
}

process.exit(1);
