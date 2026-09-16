/**
 * lib/schema/drift.mjs — assert ops' vendored schema still matches site-engine's.
 * Pure: no I/O, no network. The I/O shell is scripts/check-schema-drift.mjs.
 *
 * Why this exists
 * ---------------
 * site-engine already guards drift with `packages/schema/src/ops-drift.test.ts`
 * — but it compares site-engine's schema against `ops-shape.snapshot.json`, and
 * NOTHING compared that snapshot against ops. The refresh is two steps ("re-sync
 * ops/lib/schema … then run `pnpm schema:snapshot-ops`") and only the second was
 * enforced, so the snapshot could be refreshed while ops went stale and every
 * gate stayed green.
 *
 * It did. On 2026-09-16 ops was missing `brand.fontPairing`, `brand.shadow`,
 * `brand.spacingDensity` and two of three `services` variants — all built and
 * shipping in site-engine, all unreachable by the generation agent because its
 * schema enum did not list them. Sites looked identical for a reason no one
 * could see from either repo alone.
 *
 * This closes the loop: site-engine == snapshot (their test) AND
 * snapshot == ops (this one).
 *
 * Deliberately compares ENUM VALUE SETS, not full shapes. Porting site-engine's
 * `diffShapes` would duplicate a non-trivial differ across repos and rot; the
 * drift that actually bites is a widened enum the agent cannot choose from.
 */

/**
 * Walk a snapshot shape tree, collecting every enum by dotted config path.
 * @param {unknown} node
 * @returns {Map<string, string[]>} path -> sorted values
 */
export function collectEnums(node) {
  const found = new Map();
  (function walk(n, path) {
    if (!n || typeof n !== 'object') return;
    if (n.kind === 'enum' && Array.isArray(n.values)) {
      found.set(path, [...n.values].sort());
      return;
    }
    for (const key of Object.keys(n)) {
      // `shape` and `fields` are structural wrappers, not config path segments.
      const next = key === 'shape' || key === 'fields' ? path : path ? `${path}.${key}` : key;
      walk(n[key], next);
    }
  })(node, '');
  return found;
}

/**
 * Compare ops' actual enum sets against the snapshot's.
 *
 * `expected` is the snapshot (site-engine's truth); `actual` is what ops offers.
 * A value in the snapshot that ops lacks is the dangerous direction — shipped
 * capability the agent cannot reach. The reverse (ops offering something
 * site-engine will reject) fails the client build, so both are reported.
 *
 * @param {Map<string,string[]>} expected
 * @param {Record<string,string[]>} actual  ops path -> values
 * @returns {{path: string, missingInOps: string[], unknownToEngine: string[]}[]}
 */
export function diffEnums(expected, actual) {
  const out = [];
  for (const [path, values] of Object.entries(actual)) {
    const want = expected.get(path);
    if (!want) continue; // ops-only field; not this gate's business
    const have = [...values].sort();
    const missingInOps = want.filter((v) => !have.includes(v));
    const unknownToEngine = have.filter((v) => !want.includes(v));
    if (missingInOps.length || unknownToEngine.length) {
      out.push({ path, missingInOps, unknownToEngine });
    }
  }
  return out;
}
