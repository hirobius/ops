/**
 * scripts/lib/token-resolver.mjs — shared helpers for the token-checking gates.
 *
 * Loads hirobius.tokens.json (W3C DTCG) and provides the dot-path lookup, alias
 * resolution, and leaf-path enumeration that check-contrast, check-token-paths-
 * ratchet, and audit-tokens each re-implemented. (Candidate #12.) Lifted from the
 * cleanest existing copies: getByPath/resolveAlias from check-contrast, the
 * walkLeafPaths generator from audit-tokens' `walk`.
 *
 * Note: check-token-structure's walk is intentionally NOT covered here — it threads
 * an inherited `$type` and writes to a violations array, so it isn't a pure leaf
 * enumerator.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKENS_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../hirobius.tokens.json');

/** Parse hirobius.tokens.json from the repo root. */
export function loadTokens() {
  return JSON.parse(readFileSync(TOKENS_PATH, 'utf8'));
}

/** Traverse a dot-notation path through the token object; undefined if absent. */
export function getByPath(obj, path) {
  return path.split('.').reduce((node, key) => {
    if (node == null) return undefined;
    return node[key];
  }, obj);
}

/**
 * Resolve an alias string like "{primitive.color.neutral.white}" to its concrete
 * $value, following chains up to maxDepth levels. Throws if a referenced path is
 * missing. Non-alias inputs are returned unchanged.
 */
export function resolveAlias(ref, tokens, maxDepth = 10) {
  let current = ref;
  for (let i = 0; i < maxDepth; i++) {
    const match = typeof current === 'string' && current.match(/^\{(.+)\}$/);
    if (!match) break;
    const node = getByPath(tokens, match[1]);
    if (node == null) {
      throw new Error(`Token path not found: ${match[1]}`);
    }
    current = node.$value ?? node;
  }
  return current;
}

/** Yield every leaf dot-path (a node carrying `$value`) in the token tree. */
export function* walkLeafPaths(node, path = []) {
  if (!node || typeof node !== 'object') return;
  if ('$value' in node) {
    yield path.join('.');
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    yield* walkLeafPaths(value, [...path, key]);
  }
}
