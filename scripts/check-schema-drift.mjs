#!/usr/bin/env node
/**
 * scripts/check-schema-drift.mjs — ops' vendored ClientConfig schema must still
 * offer everything site-engine ships.
 *
 * site-engine's `packages/schema/src/ops-drift.test.ts` guards its schema against
 * `ops-shape.snapshot.json`. Nothing guarded the snapshot against ops. The
 * refresh is two steps and only one was enforced, so on 2026-09-16 ops was
 * missing `brand.fontPairing`, `brand.shadow`, `brand.spacingDensity` and two of
 * three `services` variants — all built and shipping, all unreachable by the
 * generation agent, every gate green. Generated sites looked identical for a
 * reason neither repo could see alone.
 *
 * Fails on a value site-engine ships that ops cannot choose (shipped capability
 * stranded) AND on a value ops offers that site-engine would reject (a client
 * build failure waiting to happen).
 *
 *   node scripts/check-schema-drift.mjs
 *   node scripts/check-schema-drift.mjs --json
 *
 * Refreshing after an intentional site-engine change:
 *   1. copy packages/schema/ops-shape.snapshot.json over the vendored copy below
 *   2. mirror the change in lib/schema/{index,presets}.mjs
 *   3. re-run this gate
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { collectEnums, diffEnums } from '../lib/schema/drift.mjs';
import { SECTION_VARIANTS } from '../lib/schema/index.mjs';
import { FONT_IDS, FONT_PAIRING_IDS, PALETTE_PRESET_IDS } from '../lib/schema/presets.mjs';

const ROOT = process.cwd();
const jsonMode = process.argv.includes('--json');

// Honour the proof-of-firing contract that validate-fixture-proof-of-firing.mjs
// already defines: it runs `node <gate> --fixture-mode` with FIXTURE_FILE set to
// an absolute fixture path. Without this the gate reads the real snapshot no
// matter what it is pointed at, passes on its own violating fixture, and the
// harness can only record REAL/SKIP — a fixture that cannot fail proves nothing.
// (check-focus-states had exactly this defect until 2026-09-15.)
const SNAPSHOT =
  process.env.FIXTURE_FILE ||
  join(ROOT, 'docs/guardrails/vendored/site-engine-shape.snapshot.json');

/**
 * Ops' offer, keyed by the same dotted paths the snapshot uses.
 * Only enums live here — see lib/schema/drift.mjs for why this is value-set
 * comparison rather than a full shape diff.
 */
function opsEnums() {
  const out = {
    'clientConfig.brand.font': FONT_IDS,
    'clientConfig.brand.fontPairing': FONT_PAIRING_IDS,
    'clientConfig.brand.palettePreset': PALETTE_PRESET_IDS,
  };
  for (const [section, values] of Object.entries(SECTION_VARIANTS)) {
    out[`clientConfig.layout.sections.${section}.variant`] = values;
  }
  return out;
}

function main() {
  let snapshot;
  try {
    snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  } catch (e) {
    console.error(
      `check-schema-drift: cannot read the vendored snapshot at ${SNAPSHOT} — ${e.message}`,
    );
    console.error('  Copy it from site-engine: packages/schema/ops-shape.snapshot.json');
    process.exit(1);
  }

  const diffs = diffEnums(collectEnums(snapshot), opsEnums());
  const violations = diffs.map((d) => ({
    file: 'lib/schema/index.mjs',
    line: null,
    rule: 'schema-drift',
    severity: 'error',
    message:
      `${d.path}: ` +
      [
        d.missingInOps.length
          ? `site-engine ships ${d.missingInOps.join(', ')} but ops cannot choose it`
          : '',
        d.unknownToEngine.length
          ? `ops offers ${d.unknownToEngine.join(', ')} which site-engine would reject`
          : '',
      ]
        .filter(Boolean)
        .join('; '),
  }));

  if (jsonMode) {
    console.log(JSON.stringify({ violations }, null, 2));
    process.exit(violations.length ? 1 : 0);
  }

  if (!violations.length) {
    console.log(
      `\n✓ check-schema-drift — ops offers everything site-engine ships ` +
        `(${Object.keys(opsEnums()).length} enum(s) compared).\n`,
    );
    process.exit(0);
  }

  console.error(
    `\n✗ check-schema-drift — ${violations.length} drift(s) between ops and site-engine.\n`,
  );
  for (const d of diffs) {
    console.error(`  ${d.path}`);
    if (d.missingInOps.length) {
      console.error(`    STRANDED  site-engine ships: ${d.missingInOps.join(', ')}`);
      console.error(
        '              The generation agent cannot choose these. Shipped work, unreachable.',
      );
    }
    if (d.unknownToEngine.length) {
      console.error(`    UNKNOWN   ops offers: ${d.unknownToEngine.join(', ')}`);
      console.error('              site-engine would reject these at the client build.');
    }
  }
  console.error('\n  Fix: mirror site-engine packages/schema into lib/schema/{index,presets}.mjs,');
  console.error('  and refresh docs/guardrails/vendored/site-engine-shape.snapshot.json.\n');
  process.exit(1);
}

main();
