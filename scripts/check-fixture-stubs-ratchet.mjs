#!/usr/bin/env node
/**
 * check-fixture-stubs-ratchet.mjs — B-class monotonic-decrement ratchet for fixture stubs
 *
 * Reads the current withStubFixtures count from validate-fixture-proof-of-firing
 * (--json mode) and enforces that this count strictly decreases over time. The
 * last-known count is stored in
 * docs/guardrails/baselines/check-fixture-stubs-count.json.
 *
 * Rules:
 *   - If current stub count > stored count → exit 1 (regression; a gate gained
 *     a new stub fixture without graduating to a real one).
 *   - If current stub count <= stored count → update the stored count to the new
 *     (lower or equal) value and exit 0 (progress is preserved).
 *
 * This ratchet enforces the "B-class burn-down" contract from
 * docs/guardrails/full-strictness-closure-plan.md: B is theater without a
 * ratchet; this script is the ratchet. (Adrian directive 2026-05-06)
 *
 * Canonical stored file: docs/guardrails/baselines/check-fixture-stubs-count.json
 * Shape: { count: number, updatedAt: ISO8601, sha: string }
 *
 * Wired: ci-pr channel (registry.json). Any increase to the stub count fails the PR.
 *
 * --json output: { violations: Violation[], summary: { current, stored, delta }, ok }
 *
 * Run: node scripts/check-fixture-stubs-ratchet.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const CANONICAL_FILE = join(ROOT, 'docs', 'guardrails', 'baselines', 'check-fixture-stubs-count.json');

const jsonMode = hasJsonFlag(process.argv);
const fixtureMode = process.argv.includes('--fixture-mode') || process.env.HDS_FIXTURE_MODE === '1';
const fixtureFile = process.env.FIXTURE_FILE;

// ─── Get current stub count from validate-fixture-proof-of-firing ────────────

function getCurrentStubCount() {
  // In fixture mode, read the stub count from the fixture file JSON directly.
  if (fixtureMode && fixtureFile) {
    try {
      const raw = readFileSync(fixtureFile, 'utf8');
      const data = JSON.parse(raw);
      if (typeof data?.stubCount !== 'number') {
        throw new Error('fixture file must have a top-level numeric "stubCount" field');
      }
      return data.stubCount;
    } catch (err) {
      process.stderr.write(`check-fixture-stubs-ratchet: cannot read fixture: ${err.message}\n`);
      process.exit(2);
    }
  }

  try {
    const raw = execSync('node scripts/validate-fixture-proof-of-firing.mjs --json', {
      cwd: ROOT,
      encoding: 'utf8',
    });
    const result = JSON.parse(raw);
    if (typeof result?.summary?.withStubFixtures !== 'number') {
      throw new Error('validate-fixture-proof-of-firing --json did not return summary.withStubFixtures');
    }
    return result.summary.withStubFixtures;
  } catch (err) {
    process.stderr.write(`check-fixture-stubs-ratchet: error reading stub count: ${err.message}\n`);
    process.exit(2);
  }
}

// ─── Read / write the canonical stored count ──────────────────────────────────

function readStored() {
  // In fixture mode, if the fixture file has a "storedCount" field, use it as
  // the stored baseline instead of reading the canonical file on disk.
  if (fixtureMode && fixtureFile) {
    try {
      const raw = readFileSync(fixtureFile, 'utf8');
      const data = JSON.parse(raw);
      if (typeof data?.storedCount === 'number') {
        return { count: data.storedCount, updatedAt: '2026-01-01T00:00:00.000Z', sha: 'fixture' };
      }
    } catch {
      // fall through to normal read
    }
  }
  if (!existsSync(CANONICAL_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CANONICAL_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function getGitSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();
  } catch {
    return 'unknown';
  }
}

function writeStored(count) {
  // In fixture mode, skip writing the real canonical file (read-only dry run).
  if (fixtureMode) return { count, updatedAt: new Date().toISOString(), sha: 'fixture' };
  const record = {
    count,
    updatedAt: new Date().toISOString(),
    sha: getGitSha(),
  };
  writeFileSync(CANONICAL_FILE, JSON.stringify(record, null, 2) + '\n', 'utf8');
  return record;
}

// ─── Main ────────────────────────────────────────────────────────────────────

const current = getCurrentStubCount();
const stored = readStored();

if (stored === null) {
  // Bootstrap: write the initial count and exit 0.
  writeStored(current);
  const msg = `check-fixture-stubs-ratchet: bootstrapped stored stub count = ${current}`;
  if (!jsonMode) console.log(msg);
  emitResult({
    violations: [],
    summary: { current, stored: current, delta: 0, bootstrapped: true },
    ok: true,
  }, jsonMode);
  process.exit(0);
}

const storedCount = stored.count;
const delta = current - storedCount;

if (current > storedCount) {
  // Regression: stub count grew → fail the ratchet.
  const violation = {
    file: '*',
    line: null,
    rule: 'fixture-stubs-ratchet-regression',
    severity: 'error',
    message: `Fixture stub count grew: stored=${storedCount}, current=${current} (+${delta}). Replace stub fixtures with real passing/violating examples rather than adding new stubs.`,
  };
  if (!jsonMode) {
    process.stderr.write(`\nX check-fixture-stubs-ratchet FAILED\n`);
    process.stderr.write(`  Fixture stub count grew from ${storedCount} to ${current} (+${delta}).\n`);
    process.stderr.write(`  Replace stub fixtures with real examples — do NOT add new stubs without graduating existing ones.\n\n`);
  }
  emitResult({
    violations: [violation],
    summary: { current, stored: storedCount, delta },
    ok: false,
  }, jsonMode);
  process.exit(1);
}

// Count decreased or held: update the stored value (preserves the lower watermark).
writeStored(current);

const msg = delta < 0
  ? `check-fixture-stubs-ratchet: OK — graduated ${Math.abs(delta)} stub(s) to real fixtures (${storedCount} → ${current})`
  : `check-fixture-stubs-ratchet: OK — no change (${current} stub fixture(s))`;

if (!jsonMode) console.log(msg);
emitResult({
  violations: [],
  summary: { current, stored: storedCount, delta },
  ok: true,
}, jsonMode);
process.exit(0);
