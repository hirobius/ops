/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * validators/token-sync.mjs
 *
 * p6-4: validate + normalize a "reverse token sync" payload — the shape
 * the Figma plugin emits when reading the canvas's local Variables back
 * into a manifest-shaped token tree (the inverse of sync-tokens.js).
 *
 * The plugin enumerates each `HDS Primitive` / `HDS Semantic` /
 * `HDS Component` collection and emits one entry per variable:
 *
 *   {
 *     source: 'figma-variables',
 *     emittedAt: '2026-05-01T...Z',
 *     collections: {
 *       primitive: { id, name, modes: [{modeId, name}] },
 *       semantic:  { id, name, modes: [{modeId, name}] },
 *       component: { id, name, modes: [{modeId, name}] }
 *     },
 *     tokens: {
 *       primitive: [ { path, type, value } ],
 *       semantic:  [ { path, type, value? | alias?, dark? } ],
 *       component: [ { path, type, value? | alias?, dark? } ]
 *     }
 *   }
 *
 * The validator returns `{ ok, errors, normalized }`. `normalized` is the
 * exact JSON the bridge writes to `tokens-from-figma.json` after a
 * successful round-trip — sorted, type-coerced, with alias braces canon
 * (`{primitive.foo.bar}`). The bridge endpoint refuses to write when
 * `ok === false`.
 *
 * Test ergonomics:
 *   - Default export accepts the payload directly (the run-validator-tests
 *     harness loads input.json and calls the validator with it).
 *   - Returns `{ ok, errors }` so deepEqual checks in fixtures match the
 *     same shape used by the rest of the validator suite.
 */

const ALLOWED_TIERS = ['primitive', 'semantic', 'component'];
const ALLOWED_TOKEN_TYPES = ['color', 'dimension', 'number', 'motion', 'shadow', 'typography'];

function err(path, code, message, suggestion) {
  return { path, code, message, suggestion: suggestion || null };
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function canonicalAlias(s) {
  if (typeof s !== 'string') return null;
  const stripped = s.replace(/^\{|\}$/g, '').trim();
  if (!stripped) return null;
  // Reject malformed alias paths early so the writer never persists them.
  if (!/^[a-z][a-zA-Z0-9._-]+$/.test(stripped)) return null;
  return `{${stripped}}`;
}

function validateTokenEntry(tier, entry, errors) {
  if (!isPlainObject(entry)) {
    errors.push(err('__token__', 'TOKEN_INVALID_SHAPE', `${tier} token must be an object`));
    return null;
  }
  if (typeof entry.path !== 'string' || !entry.path.startsWith(`${tier}.`)) {
    errors.push(err(entry.path || '__token__', 'TOKEN_PATH_INVALID',
      `${tier} token.path must start with "${tier}."`));
    return null;
  }
  if (typeof entry.type !== 'string' || !ALLOWED_TOKEN_TYPES.includes(entry.type)) {
    errors.push(err(entry.path, 'TOKEN_TYPE_INVALID',
      `unsupported token.type: ${JSON.stringify(entry.type)}`,
      `expected one of: ${ALLOWED_TOKEN_TYPES.join(', ')}`));
    return null;
  }

  const out = { path: entry.path, type: entry.type };

  // Either an alias (semantic / component referencing primitive) or a
  // concrete value. A token with neither is malformed — Figma always
  // resolves to one or the other on a known mode.
  const hasAlias = typeof entry.alias === 'string' && entry.alias.length > 0;
  const hasValue = entry.value !== undefined && entry.value !== null;
  if (!hasAlias && !hasValue) {
    errors.push(err(entry.path, 'TOKEN_VALUE_MISSING',
      'token must declare either `alias` or `value`'));
    return null;
  }

  if (hasAlias) {
    const canon = canonicalAlias(entry.alias);
    if (!canon) {
      errors.push(err(entry.path, 'TOKEN_ALIAS_MALFORMED',
        `alias must be a token path string, got ${JSON.stringify(entry.alias)}`));
      return null;
    }
    out.alias = canon;
  }
  if (hasValue) {
    out.value = entry.value;
  }

  // Optional dark-mode overlay carries the same alias/value subset.
  if (entry.dark !== undefined) {
    if (!isPlainObject(entry.dark)) {
      errors.push(err(entry.path, 'TOKEN_DARK_INVALID',
        '`dark` must be an object with `alias` or `value`'));
      return null;
    }
    const dark = {};
    if (typeof entry.dark.alias === 'string' && entry.dark.alias.length > 0) {
      const canon = canonicalAlias(entry.dark.alias);
      if (!canon) {
        errors.push(err(entry.path, 'TOKEN_DARK_ALIAS_MALFORMED',
          `dark.alias must be a token path string, got ${JSON.stringify(entry.dark.alias)}`));
        return null;
      }
      dark.alias = canon;
    }
    if (entry.dark.value !== undefined && entry.dark.value !== null) {
      dark.value = entry.dark.value;
    }
    if (Object.keys(dark).length === 0) {
      errors.push(err(entry.path, 'TOKEN_DARK_EMPTY',
        '`dark` must declare at least one of `alias`, `value`'));
      return null;
    }
    out.dark = dark;
  }

  if (typeof entry.description === 'string' && entry.description.length > 0) {
    out.description = entry.description;
  }

  return out;
}

function sortByPath(a, b) {
  return a.path.localeCompare(b.path);
}

export default function validate(input) {
  const errors = [];

  if (!isPlainObject(input)) {
    return {
      ok: false,
      errors: [err('__root__', 'PAYLOAD_INVALID', 'reverse-sync payload must be a JSON object')],
    };
  }

  if (input.source && input.source !== 'figma-variables') {
    errors.push(err('source', 'PAYLOAD_SOURCE_INVALID',
      `expected source="figma-variables", got ${JSON.stringify(input.source)}`));
  }

  if (!isPlainObject(input.tokens)) {
    errors.push(err('tokens', 'TOKENS_MISSING', 'payload.tokens must be an object'));
    return { ok: false, errors };
  }

  const seenPaths = new Set();
  const normalizedTokens = { primitive: [], semantic: [], component: [] };

  for (const tier of ALLOWED_TIERS) {
    const list = input.tokens[tier];
    if (list == null) continue; // tier may legitimately be empty
    if (!Array.isArray(list)) {
      errors.push(err(`tokens.${tier}`, 'TIER_NOT_ARRAY',
        `tokens.${tier} must be an array, got ${typeof list}`));
      continue;
    }

    for (const entry of list) {
      const norm = validateTokenEntry(tier, entry, errors);
      if (!norm) continue;
      if (seenPaths.has(norm.path)) {
        errors.push(err(norm.path, 'TOKEN_DUPLICATE_PATH',
          `path "${norm.path}" appears more than once`));
        continue;
      }
      seenPaths.add(norm.path);
      normalizedTokens[tier].push(norm);
    }
  }

  // Reject unknown top-level tiers up front so a typo (`tokens.primitives`
  // plural) doesn't silently drop a hundred variables on the floor.
  for (const key of Object.keys(input.tokens)) {
    if (!ALLOWED_TIERS.includes(key)) {
      errors.push(err(`tokens.${key}`, 'TIER_UNKNOWN',
        `unknown tier "${key}"; expected one of: ${ALLOWED_TIERS.join(', ')}`));
    }
  }

  for (const tier of ALLOWED_TIERS) {
    normalizedTokens[tier].sort(sortByPath);
  }

  const ok = errors.length === 0;
  const normalized = ok
    ? {
        source: 'figma-variables',
        emittedAt: typeof input.emittedAt === 'string' ? input.emittedAt : null,
        collections: isPlainObject(input.collections) ? input.collections : null,
        tokens: normalizedTokens,
      }
    : null;

  return { ok, errors, normalized };
}
