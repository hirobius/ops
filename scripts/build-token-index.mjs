/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * Hirobius Design System — Token Usage Index
 *
 * Static analysis script that walks src/ for token references and produces
 * src/app/design-system/token-usage-map.json — a committed artefact consumed
 * by headless token-scan workflows and fix-prompt generation.
 *
 * Run:   node scripts/build-token-index.mjs
 * Also:  pnpm tokens:index
 *
 * Pure functions are exported so they can be unit-tested with Vitest.
 */

import { readFileSync, writeFileSync, mkdirSync , readdirSync, statSync } from 'fs';
import { join, dirname, relative }                 from 'path';
import { fileURLToPath }                           from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

// ── Pure helpers (exported for tests) ────────────────────────────────────────

/**
 * Convert a dot-notation token path to a CSS custom-property name.
 * 'primitive.color.blue.500' → '--primitive-color-blue-500'
 */
export function pathToCSSVar(dotPath) {
  return '--' + dotPath.replaceAll('.', '-');
}

/** Resolve a {ref} alias to its raw leaf $value in the token tree. */
function resolveAlias(ref, root, visited = new Set()) {
  if (typeof ref !== 'string' || !ref.startsWith('{')) return ref;
  if (visited.has(ref)) throw new Error(`Circular reference: ${ref}`);
  visited.add(ref);
  const parts = ref.replace(/^\{|\}$/g, '').split('.');
  let node = root;
  for (const p of parts) {
    node = node?.[p];
    if (node === undefined) throw new Error(`Token not found: ${ref}`);
  }
  if (!('$value' in node)) throw new Error(`Not a leaf token: ${ref}`);
  return resolveAlias(node.$value, root, visited);
}

/** Convert a raw token $value to a flat string (handles hex, numbers, arrays). */
function valueToString(val) {
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) return val.join(', ');
  if (val && typeof val === 'object') {
    // Dimension/duration objects: { value, unit }
    if ('value' in val && 'unit' in val) return `${val.value}${val.unit}`;
    // Color component objects — rarely used in this project but handle gracefully
    if ('components' in val) {
      const [r, g, b] = val.components.map((c) => Math.round(c * 255));
      return val.alpha !== undefined && val.alpha < 1
        ? `rgb(${r} ${g} ${b} / ${val.alpha})`
        : `rgb(${r} ${g} ${b})`;
    }
    return JSON.stringify(val);
  }
  return String(val);
}

const DTCG_SKIP = new Set(['$type', '$value', '$description', '$extensions', '$schema']);

/**
 * Walk a W3C DTCG token tree and return a flat map of CSS var → resolved value.
 * Aliases are fully resolved to their primitive leaf values.
 *
 * @param {object} tokenTree - Parsed hirobius.tokens.json
 * @returns {{ [cssVar: string]: string }}
 */
export function buildExpectedValues(tokenTree) {
  const result = {};

  function walk(node, path) {
    if (!node || typeof node !== 'object') return;
    if ('$value' in node) {
      const cssVar = pathToCSSVar(path.join('.'));
      let raw = node.$value;
      // Resolve aliases using the top-level tree
      if (typeof raw === 'string' && raw.startsWith('{')) {
        try {
          raw = resolveAlias(raw, tokenTree);
        } catch (error) {
          // Unresolvable alias — warn and skip
          console.warn(`[warn] Unresolvable alias at ${path.join('.')}: ${error.message}`);
          return;
        }
      }
      result[cssVar] = valueToString(raw);
      return;
    }
    for (const key of Object.keys(node)) {
      if (DTCG_SKIP.has(key)) continue;
      walk(node[key], [...path, key]);
    }
  }

  walk(tokenTree, []);
  return result;
}

/**
 * Parse a CSS file and return the set of all CSS custom property names defined
 * in it (any selector). Used to whitelist vars from theme.css that are valid
 * but not defined in hirobius.tokens.json.
 *
 * @param {string} cssText
 * @returns {Set<string>}
 */
export function parseCSSVarDefinitions(cssText) {
  const defs = new Set();
  for (const m of cssText.matchAll(/^\s*(--[\w-]+)\s*:/gm)) {
    defs.add(m[1].trim());
  }
  return defs;
}

/**
 * Given a Set of all token refs found in source files and the expected values
 * map, return CSS var names (--prefixed) that appear in source but are not
 * defined in expectedValues OR in the optional knownVars allowlist.
 *
 * v1: skips hds.* JS-style refs entirely — only checks --prefixed CSS vars.
 *
 * @param {Set<string>} sourceRefs
 * @param {{ [cssVar: string]: string }} expectedValues
 * @param {Set<string>} [knownVars]  - Additional valid vars (e.g. from theme.css)
 * @returns {string[]}
 */
export function findDeadTokens(sourceRefs, expectedValues, knownVars = new Set()) {
  const dead = [];
  for (const ref of sourceRefs) {
    if (!ref.startsWith('--')) continue; // skip hds.* and anything else
    if (ref in expectedValues) continue;
    if (knownVars.has(ref)) continue;
    dead.push(ref);
  }
  return dead;
}

/**
 * Extract hex color values that are wrapped in backticks from markdown text.
 * Only 6-digit hex codes are matched: `#1e2fff`
 *
 * @param {string} markdown
 * @returns {string[]}
 */
export function parseHandoffHexes(markdown) {
  const matches = [];
  const re = /`(#[0-9a-fA-F]{6})`/g;
  let m;
  while ((m = re.exec(markdown)) !== null) {
    matches.push(m[1]);
  }
  return matches;
}

/**
 * Compare hex values from DESIGN-HANDOFF.md against all values in expectedValues.
 * Returns drift entries for hexes not found in any token value (case-insensitive).
 *
 * @param {string[]} handoffHexes
 * @param {{ [cssVar: string]: string }} expectedValues
 * @returns {Array<{ handoffValue: string, tokenValue: null, file: string }>}
 */
export function diffHandoffHexes(handoffHexes, expectedValues) {
  const tokenValues = new Set(
    Object.values(expectedValues).map((v) => v.toLowerCase())
  );
  return handoffHexes
    .filter((hex) => !tokenValues.has(hex.toLowerCase()))
    .map((hex) => ({ handoffValue: hex, tokenValue: null, file: 'DESIGN-HANDOFF.md' }));
}

/**
 * Find all `// audit-ok: reason` comments in a file's content.
 *
 * @param {string} relPath  - Relative path (used in output entries)
 * @param {string} content  - File content string
 * @returns {Array<{ file: string, line: number, reason: string }>}
 */
export function findAuditOkComments(relPath, content) {
  const results = [];
  const lines = content.split('\n');
  const re = /\/\/\s*audit-ok:\s*(.+)/;
  lines.forEach((line, idx) => {
    const m = re.exec(line);
    if (m) {
      results.push({ file: relPath, line: idx + 1, reason: m[1].trim() });
    }
  });
  return results;
}

// ── File system helpers ───────────────────────────────────────────────────────

/** Recursively yield all files under dir matching the extension filter. */
function* walkFiles(dir, exts) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      // Skip node_modules and hidden dirs
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      yield* walkFiles(full, exts);
    } else if (exts.some((e) => entry.endsWith(e))) {
      yield full;
    }
  }
}

// ── Main entry (runs when called directly) ────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const SRC_DIR     = join(ROOT, 'src');
  const OUTPUT_FILE = join(ROOT, 'src', 'app', 'design-system', 'token-usage-map.json');
  const HANDOFF_FILE = join(ROOT, 'DESIGN-HANDOFF.md');
  const TOKEN_FILE   = join(ROOT, 'hirobius.tokens.json');
  const THEME_CSS_FILE = join(ROOT, 'src', 'styles', 'theme.css');

  // 1. Build expectedValues from the token source of truth
  const tokenTree    = JSON.parse(readFileSync(TOKEN_FILE, 'utf8'));
  const expectedValues = buildExpectedValues(tokenTree);

  // 1b. Build allowlist from theme.css + tokens.css — both define valid CSS vars
  //     that are not in hirobius.tokens.json (HDS vars, Tailwind bridge, composites)
  const cssAllowlistFiles = [
    { path: THEME_CSS_FILE,          label: 'theme.css' },
    { path: join(ROOT, 'src', 'styles', 'tokens.css'), label: 'tokens.css' },
  ];
  const themeDefinedVars = new Set();
  for (const { path, label } of cssAllowlistFiles) {
    try {
      for (const v of parseCSSVarDefinitions(readFileSync(path, 'utf8'))) {
        themeDefinedVars.add(v);
      }
    } catch {
      console.warn(`[warn] ${label} not found — dead token check may have false positives`);
    }
  }

  // 2. Walk src/ files collecting all token refs
  const byToken = {};  // { tokenRef: Set<relPath> }
  const byFile  = {};  // { relPath: Set<tokenRef> }
  const allSourceRefs = new Set();
  const auditOkComments = [];

  const TOKEN_RE = /(?:hds\.\w[\w.]*|--[A-Za-z0-9-]+)/g;

  for (const absPath of walkFiles(SRC_DIR, ['.ts', '.tsx', '.css'])) {
    const relPath = relative(ROOT, absPath).replaceAll('\\', '/');
    const content = readFileSync(absPath, 'utf8');

    // Collect token refs
    const fileRefs = new Set();
    for (const match of content.matchAll(TOKEN_RE)) {
      const ref = match[0];
      const start = match.index ?? 0;
      const end = start + ref.length;
      const nextChar = content[end] ?? '';

      // Skip template-prefix fragments like `--semantic-color-${...}` and
      // unfinished placeholders like `--primitive-radius-`.
      if (ref.endsWith('-')) continue;
      if (nextChar === '-') continue;

      fileRefs.add(ref);
    }

    for (const ref of fileRefs) {
      allSourceRefs.add(ref);
      if (!byToken[ref]) byToken[ref] = [];
      if (!byToken[ref].includes(relPath)) byToken[ref].push(relPath);
    }

    if (fileRefs.size > 0) {
      byFile[relPath] = [...fileRefs];
    }

    // Collect audit-ok comments
    auditOkComments.push(...findAuditOkComments(relPath, content));
  }

  // 3. Find dead tokens (CSS var refs in source not in expectedValues or theme.css)
  const deadTokens = findDeadTokens(allSourceRefs, expectedValues, themeDefinedVars);

  // 4. Parse DESIGN-HANDOFF.md for hex drift
  let handoffDrift = [];
  try {
    const handoffMd = readFileSync(HANDOFF_FILE, 'utf8');
    const handoffHexes = parseHandoffHexes(handoffMd);
    handoffDrift = diffHandoffHexes(handoffHexes, expectedValues);
  } catch {
    console.warn('[warn] DESIGN-HANDOFF.md not found - skipping hex drift check');
  }

  // 5. Serialize byToken values to sorted arrays
  const byTokenSorted = Object.fromEntries(
    Object.entries(byToken).map(([k, v]) => [k, [...new Set(v)].sort()])
  );

  // 6. Write output
  const output = {
    generated: new Date().toISOString(),
    byToken: byTokenSorted,
    byFile,
    expectedValues,
    handoffDrift,
    deadTokens: deadTokens.sort(),
    auditOkComments,
  };

  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  const tokenCount  = Object.keys(byToken).length;
  const fileCount   = Object.keys(byFile).length;
  const deadCount   = deadTokens.length;
  const driftCount  = handoffDrift.length;
  const auditCount  = auditOkComments.length;
  const expCount    = Object.keys(expectedValues).length;

  console.log(`[ok] token-usage-map.json - ${tokenCount} token refs across ${fileCount} files | ${expCount} expected tokens | ${deadCount} dead | ${driftCount} handoff drift | ${auditCount} audit-ok`);
}
