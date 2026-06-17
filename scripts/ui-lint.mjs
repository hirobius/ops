#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/ui-lint.mjs
 *
 * p6-2: thin CLI wrapper around GET http://localhost:3005/lint. Asks the
 * bridge to run the validator suite over its current in-memory selection
 * and prints findings. Exits non-zero when findings are non-empty so it
 * can compose with other shell gates.
 *
 * Usage: pnpm ui:lint
 *
 * Requires:
 *   - bridge running (`node scripts/hds-bridge.mjs`)
 *   - `lintEnabled: true` in bridge.config.json
 *   - the Figma plugin to have posted a recent selection to /selection
 */

const BRIDGE_URL = process.env.HDS_BRIDGE_URL || 'http://localhost:3005';

async function main() {
  let res;
  try {
    res = await fetch(`${BRIDGE_URL}/lint`);
  } catch (err) {
    console.error(`[ui:lint] could not reach ${BRIDGE_URL}/lint — is the bridge running?`);
    console.error(`         ${err.message}`);
    process.exit(2);
  }

  if (res.status === 404) {
    const body = await res.json().catch(() => ({}));
    if (body && body.flag === 'lintEnabled') {
      console.error('[ui:lint] /lint is disabled — set "lintEnabled": true in bridge.config.json');
      process.exit(2);
    }
    console.error('[ui:lint] bridge returned 404');
    process.exit(2);
  }

  if (!res.ok) {
    console.error(`[ui:lint] bridge returned ${res.status}`);
    process.exit(2);
  }

  const data = await res.json();
  const findings = Array.isArray(data.findings) ? data.findings : [];

  if (findings.length === 0) {
    console.log('[ui:lint] OK — no findings');
    process.exit(0);
  }

  console.log(`[ui:lint] ${findings.length} finding(s):`);
  for (const f of findings) {
    console.log(`  - [${f.code}] ${f.path}: ${f.message}`);
    if (f.suggestion) console.log(`      → ${f.suggestion}`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error('[ui:lint] unexpected error:', err);
  process.exit(2);
});
