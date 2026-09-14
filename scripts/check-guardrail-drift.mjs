#!/usr/bin/env node
/**
 * check-guardrail-drift.mjs
 *
 * Shared guardrail harness scripts (proof-of-firing, run-gates, the registry
 * validator, …) are vendored into multiple repos (ops / hds / site-engine).
 * When one repo fixes a bug in a shared script, the fix can silently fail to
 * reach the siblings — exactly what happened in #180/#206 (ops carried a
 * cached-`skip`-as-failure bug hds had already fixed).
 *
 * This gate pins each shared script to a canonical sha256 in
 * docs/guardrails/shared-manifest.json and fails when a local copy drifts.
 * ops is the canonical source: fix a shared script here, run `--write` to
 * re-pin, and every sibling repo's copy of this gate goes red until it syncs
 * the new version. Node built-ins only — no deps.
 *
 * Usage:
 *   node scripts/check-guardrail-drift.mjs            # verify (CI gate)
 *   node scripts/check-guardrail-drift.mjs --json     # machine-readable report
 *   node scripts/check-guardrail-drift.mjs --write    # re-pin hashes (canonical repo only)
 *
 * Fixture mode (proof-of-firing, see validate-fixture-proof-of-firing.mjs):
 *   --fixture-mode with env FIXTURE_FILE=<path> substitutes the manifest
 *   path (both for reads and, if --write is also passed, for writes) so the
 *   gate can be proven against fixtures/check-guardrail-drift/*.example.json
 *   without touching the real manifest.
 *
 * Exit codes: 0 clean · 1 drift/missing · 2 invocation error (no manifest, etc.)
 *
 * @module check-guardrail-drift
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REAL_MANIFEST_PATH = resolve(ROOT, 'docs', 'guardrails', 'shared-manifest.json');

const JSON_MODE = process.argv.includes('--json');
const WRITE_MODE = process.argv.includes('--write');
const FIXTURE_MODE =
  process.argv.includes('--fixture-mode') || process.env.HDS_FIXTURE_MODE === '1';
const FIXTURE_FILE = process.env.FIXTURE_FILE;

const MANIFEST_PATH = FIXTURE_MODE && FIXTURE_FILE ? resolve(FIXTURE_FILE) : REAL_MANIFEST_PATH;

function sha256(absPath) {
  return createHash('sha256').update(readFileSync(absPath)).digest('hex');
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(
      `check-guardrail-drift: no manifest at ${MANIFEST_PATH}\n` +
        `      fix: create it (see the "files" allowlist), then run --write to pin hashes.`,
    );
    process.exit(2);
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

function main() {
  const manifest = loadManifest();
  const files = manifest.files || {};
  const paths = Object.keys(files).sort();

  if (paths.length === 0) {
    console.error(`check-guardrail-drift: manifest lists no files under "files".`);
    process.exit(2);
  }

  // --write: re-pin every listed path from the current tree and exit.
  if (WRITE_MODE) {
    for (const rel of paths) {
      const abs = resolve(ROOT, rel);
      if (!existsSync(abs)) {
        console.error(`check-guardrail-drift --write: listed file is missing: ${rel}`);
        process.exit(2);
      }
      files[rel] = `sha256:${sha256(abs)}`;
    }
    manifest.files = files;
    writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`check-guardrail-drift: re-pinned ${paths.length} shared script(s) ✓`);
    return;
  }

  // verify
  const findings = [];
  for (const rel of paths) {
    const abs = resolve(ROOT, rel);
    if (!existsSync(abs)) {
      findings.push({ path: rel, kind: 'missing' });
      continue;
    }
    const actual = `sha256:${sha256(abs)}`;
    if (actual !== files[rel]) {
      findings.push({ path: rel, kind: 'drift', expected: files[rel], actual });
    }
  }

  if (JSON_MODE) {
    console.log(JSON.stringify({ ok: findings.length === 0, findings }, null, 2));
    process.exit(findings.length === 0 ? 0 : 1);
  }

  if (findings.length === 0) {
    console.log(`check-guardrail-drift: ${paths.length} shared script(s) match canonical ✓`);
    return;
  }

  const canonical = manifest.canonicalRepo || 'the canonical repo';
  console.error(`check-guardrail-drift: ${findings.length} finding(s)\n`);
  for (const f of findings) {
    if (f.kind === 'missing') {
      console.error(`  ${f.path}  [missing]  shared script not found in this repo`);
      console.error(`      fix: copy it from ${canonical} and commit.\n`);
    } else {
      console.error(`  ${f.path}  [drift]  differs from the canonical version`);
      console.error(
        `      fix: sync this file from ${canonical} (a shared fix has not propagated),`,
      );
      console.error(
        `           or — if you intended to change it — apply the same change in ${canonical}`,
      );
      console.error(
        `           and run \`node scripts/check-guardrail-drift.mjs --write\` there to re-pin.\n`,
      );
    }
  }
  process.exit(1);
}

main();
