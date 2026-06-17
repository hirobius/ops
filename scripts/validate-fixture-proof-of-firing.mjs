#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/validate-fixture-proof-of-firing.mjs
 *
 * Meta-validator: walks docs/guardrails/registry.json and for every registered
 * gate asserts that a fixture pair exists in fixtures/<gate-id>/.
 *
 * Fixture lifecycle:
 *   MISSING  → both files absent       → ERROR (no stub = drift)
 *   STUB     → TODO marker on line 1   → WARN but exit 0
 *   REAL     → no TODO marker + gate   → RUN gate against fixture, assert behavior
 *
 * The "run" path currently only fires when BOTH of these are true:
 *   1. Neither fixture file starts with "// TODO:" or "<!-- TODO:"
 *   2. The gate script itself exists on disk
 *
 * For REAL fixtures, the gate is invoked with env FIXTURE_FILE=<path>
 * so that gates which support targeted-file mode can use it. Gates that
 * don't support FIXTURE_FILE will scan their normal directories — the
 * fixture file in fixtures/<gate-id>/ won't be seen and the "run" step
 * is skipped with a note.
 *
 * Exit codes:
 *   0 — all gates accounted for; stubs warned, no missing fixtures
 *   1 — at least one gate has MISSING fixtures or REAL fixture failed proof
 *
 * Flags:
 *   --json   emit JSON to stdout: { total, withRealFixtures, withStubFixtures,
 *             withMissingFixtures, failures: [...] }
 *   --verbose  show detail for every gate, not just failures/warnings
 *
 * Performance — mtime-based cache:
 *   Cache file: .fixture-proof-cache.json (gitignored)
 *   Format: { [gateId]: { violatingMtime, passingMtime, lastResult } }
 *   On pre-commit, only re-runs gates whose fixture mtimes changed.
 *   Full scan is always done in --json mode or CI.
 *
 * Unit: 13g-3-fixture-proof-of-firing
 */

import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const ARGV = process.argv.slice(2);
const JSON_MODE = ARGV.includes('--json');
const VERBOSE = ARGV.includes('--verbose');
const NO_CACHE = ARGV.includes('--no-cache') || JSON_MODE;
const FIXTURE_MODE = ARGV.includes('--fixture-mode') || process.env.HDS_FIXTURE_MODE === '1';
const FIXTURE_REGISTRY = process.env.FIXTURE_FILE;

// ---------------------------------------------------------------------------
// Stub marker detection
// ---------------------------------------------------------------------------

const STUB_MARKERS = [
  '// TODO: replace with real-violating-example',
  '// TODO: replace with real-passing-example',
  '<!-- TODO: replace with real-violating-example',
  '<!-- TODO: replace with real-passing-example',
  '{ "__stub": true',
  // Prettier formats single-line JSON to multiline — also match the indented form
  '"__stub": true',
];

/**
 * Returns true if the file starts with a known stub marker (first 256 bytes).
 */
function isStubFile(filePath) {
  try {
    const buf = readFileSync(filePath, 'utf-8');
    const head = buf.slice(0, 256);
    return STUB_MARKERS.some((m) => head.includes(m));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// mtime cache
// ---------------------------------------------------------------------------

const CACHE_PATH = resolve(ROOT, '.fixture-proof-cache.json');

function loadCache() {
  if (!existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  try {
    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n', 'utf-8');
  } catch {
    // Non-fatal: cache write failure should not block the validator
  }
}

function getMtime(filePath) {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Gate runner — only for REAL (non-stub) fixtures
// ---------------------------------------------------------------------------

/**
 * Attempt to run a gate script against a fixture file.
 * Gates that support FIXTURE_FILE env will use it for targeted scan.
 * Returns { ran: bool, exitCode: number|null, skipped: bool, skipReason: string }
 */
function runGateAgainstFixture(gateScript, fixturePath) {
  const absScript = resolve(ROOT, gateScript);
  if (!existsSync(absScript)) {
    return {
      ran: false,
      exitCode: null,
      skipped: true,
      skipReason: `gate script missing: ${gateScript}`,
    };
  }

  // We pass FIXTURE_FILE env var and also --fixture-mode flag.
  // Gates that support targeted mode should check:
  //   process.env.FIXTURE_FILE  — absolute path to the fixture
  //   process.argv includes --fixture-mode
  const env = {
    ...process.env,
    FIXTURE_FILE: fixturePath,
    HDS_FIXTURE_MODE: '1',
  };

  try {
    execSync(`node "${absScript}" --fixture-mode`, {
      env,
      stdio: 'pipe',
      timeout: 15_000,
      cwd: ROOT,
    });
    return { ran: true, exitCode: 0, skipped: false, skipReason: null };
  } catch (err) {
    const exitCode = err.status ?? 1;
    return { ran: true, exitCode, skipped: false, skipReason: null };
  }
}

// ---------------------------------------------------------------------------
// Main validation loop
// ---------------------------------------------------------------------------

function validate() {
  // In fixture mode, use FIXTURE_FILE as the registry (synthetic mini-registry).
  const registryPath =
    FIXTURE_MODE && FIXTURE_REGISTRY
      ? resolve(FIXTURE_REGISTRY)
      : resolve(ROOT, 'docs/guardrails/registry.json');

  if (!existsSync(registryPath)) {
    console.error(`✗ validate-fixture-proof-of-firing: registry not found: ${registryPath}`);
    process.exit(1);
  }

  const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));
  const gates = registry.gates ?? [];

  const cache = NO_CACHE ? {} : loadCache();
  const newCache = {};

  // Results
  const missing = []; // gates with no fixture dir or missing files
  const stubs = []; // gates with stub markers
  const real = []; // gates with real fixtures
  const failures = []; // real fixtures that failed proof-of-firing
  const scriptMissing = []; // gates whose gateScript doesn't exist on disk

  for (const gate of gates) {
    const gateId = gate.id;
    const gateScript = gate.gateScript;

    // Check if gate script exists on disk
    const scriptPath = resolve(ROOT, gateScript ?? '');
    const scriptExists = gateScript && existsSync(scriptPath);
    if (!scriptExists) {
      scriptMissing.push({ id: gateId, script: gateScript });
    }

    const fixtureDir = resolve(ROOT, 'fixtures', gateId);

    // Determine fixture file extensions — try all known extensions
    const EXTS = ['.tsx', '.json', '.md', '.txt', '.mjs', '.js'];
    let violatingPath = null;
    let passingPath = null;

    for (const ext of EXTS) {
      const vp = join(fixtureDir, `violating.example${ext}`);
      const pp = join(fixtureDir, `passing.example${ext}`);
      if (existsSync(vp)) violatingPath = vp;
      if (existsSync(pp)) passingPath = pp;
      if (violatingPath && passingPath) break;
    }

    // MISSING case: no fixture dir or missing files
    if (!violatingPath || !passingPath) {
      const detail = !existsSync(fixtureDir)
        ? 'fixture directory does not exist'
        : !violatingPath
          ? 'missing violating.example.<ext>'
          : 'missing passing.example.<ext>';
      missing.push({ id: gateId, detail });
      if (VERBOSE) console.warn(`  [MISSING] ${gateId}: ${detail}`);
      continue;
    }

    const violatingMtime = getMtime(violatingPath);
    const passingMtime = getMtime(passingPath);

    // Check stub markers
    const violatingIsStub = isStubFile(violatingPath);
    const passingIsStub = isStubFile(passingPath);

    if (violatingIsStub || passingIsStub) {
      stubs.push({
        id: gateId,
        violatingIsStub,
        passingIsStub,
        violatingPath,
        passingPath,
      });
      if (VERBOSE)
        console.warn(`  [STUB] ${gateId} — stub markers present, skipping proof-of-firing`);
      newCache[gateId] = { violatingMtime, passingMtime, lastResult: 'stub' };
      continue;
    }

    // REAL fixture path — check cache first
    const cached = cache[gateId];
    if (
      !NO_CACHE &&
      cached &&
      cached.violatingMtime === violatingMtime &&
      cached.passingMtime === passingMtime &&
      cached.lastResult !== undefined
    ) {
      // Cache hit — skip re-run
      if (cached.lastResult === 'pass') {
        real.push({ id: gateId, fromCache: true });
      } else {
        failures.push({ id: gateId, reason: 'cached failure', fromCache: true });
      }
      newCache[gateId] = cached;
      if (VERBOSE) console.log(`  [REAL/CACHE] ${gateId} — cache hit (${cached.lastResult})`);
      continue;
    }

    // Run the gate against the violating fixture (expect exit != 0)
    real.push({ id: gateId });

    if (!scriptExists) {
      // Can't run — no script
      const reason = `gate script not found: ${gateScript}`;
      failures.push({ id: gateId, reason, fixturePath: violatingPath });
      newCache[gateId] = { violatingMtime, passingMtime, lastResult: 'fail' };
      if (VERBOSE) console.error(`  [FAIL] ${gateId}: ${reason}`);
      continue;
    }

    // Run against violating fixture — expect non-zero exit
    const violatingRun = runGateAgainstFixture(gateScript, violatingPath);

    if (violatingRun.skipped) {
      if (VERBOSE) console.warn(`  [REAL/SKIP] ${gateId}: ${violatingRun.skipReason}`);
      newCache[gateId] = { violatingMtime, passingMtime, lastResult: 'skip' };
      continue;
    }

    if (violatingRun.exitCode === 0) {
      // Gate should have caught the violation but didn't — proof-of-firing FAILED
      const reason = `violating fixture did not trigger gate (exit 0 expected non-zero)`;
      failures.push({ id: gateId, reason, fixturePath: violatingPath });
      newCache[gateId] = { violatingMtime, passingMtime, lastResult: 'fail' };
      if (!JSON_MODE) console.error(`  [FAIL] ${gateId}: ${reason}`);
      continue;
    }

    // Run against passing fixture — expect zero exit
    const passingRun = runGateAgainstFixture(gateScript, passingPath);

    if (passingRun.skipped) {
      if (VERBOSE) console.warn(`  [REAL/SKIP] ${gateId}: ${passingRun.skipReason}`);
      newCache[gateId] = { violatingMtime, passingMtime, lastResult: 'skip' };
      continue;
    }

    if (passingRun.exitCode !== 0) {
      // Gate should pass on the passing fixture but failed — false positive
      const reason = `passing fixture triggered gate (expected exit 0, got ${passingRun.exitCode})`;
      failures.push({ id: gateId, reason, fixturePath: passingPath });
      newCache[gateId] = { violatingMtime, passingMtime, lastResult: 'fail' };
      if (!JSON_MODE) console.error(`  [FAIL] ${gateId}: ${reason}`);
      continue;
    }

    // Both sides passed
    newCache[gateId] = { violatingMtime, passingMtime, lastResult: 'pass' };
    if (VERBOSE) console.log(`  [REAL/PASS] ${gateId} — gate fires correctly`);
  }

  // Persist updated cache
  if (!NO_CACHE) {
    saveCache(newCache);
  }

  // ---------------------------------------------------------------------------
  // Results
  // ---------------------------------------------------------------------------

  const total = gates.length;
  const withRealFixtures = real.length;
  const withStubFixtures = stubs.length;
  const withMissingFixtures = missing.length;

  if (JSON_MODE) {
    // Canonical Violation shape per scripts/lib/gate-output.mjs (unit 13p-7).
    // Each unit's debt becomes one row:
    //   - missing fixtures        → severity:'error'   (must fix; no fixture pair)
    //   - proof-of-firing failures → severity:'error'  (real fixtures don't fire)
    //   - stub fixtures           → severity:'baselined' (known TODO; burn-down)
    //   - scripts missing         → severity:'error'   (registry drift)
    const violations = [];
    for (const m of missing) {
      violations.push({
        file: 'docs/guardrails/registry.json',
        line: null,
        rule: 'fixture-missing',
        severity: 'error',
        message: `${m.id}: ${m.detail || 'fixture pair missing'}`,
        gateId: m.id,
      });
    }
    for (const f of failures) {
      violations.push({
        file: f.fixturePath || `fixtures/${f.id}/`,
        line: null,
        rule: 'fixture-proof-of-firing-failure',
        severity: 'error',
        message: `${f.id}: ${f.reason ?? 'unknown'}`,
        gateId: f.id,
      });
    }
    for (const s of stubs) {
      violations.push({
        file: `fixtures/${s.id}/`,
        line: null,
        rule: 'fixture-stub',
        severity: 'baselined',
        message: `${s.id}: stub fixture (TODO marker) — burn down by replacing with real fixture`,
        gateId: s.id,
        violatingPath: s.violatingPath,
        passingPath: s.passingPath,
      });
    }
    for (const s of scriptMissing) {
      violations.push({
        file: s.script || 'docs/guardrails/registry.json',
        line: null,
        rule: 'gate-script-missing',
        severity: 'error',
        message: `${s.id}: registered gateScript not found on disk`,
        gateId: s.id,
      });
    }
    const output = {
      violations,
      summary: {
        total,
        withRealFixtures,
        withStubFixtures,
        withMissingFixtures,
        scriptsMissingFromDisk: scriptMissing.length,
        failures: failures.length,
      },
      ok: failures.length === 0 && missing.length === 0 && scriptMissing.length === 0,
    };
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  } else {
    // Human-readable summary
    const stamp = '[validate-fixture-proof-of-firing]';
    console.log(`${stamp} Total gates: ${total}`);
    console.log(`${stamp} Real fixtures (both files, non-stub): ${withRealFixtures}`);
    console.log(`${stamp} Stub fixtures (TODO markers, warn-only): ${withStubFixtures}`);
    console.log(`${stamp} Missing fixtures (error): ${withMissingFixtures}`);
    if (failures.length > 0) {
      console.error(`${stamp} Proof-of-firing failures: ${failures.length}`);
      for (const f of failures) {
        console.error(`  FAIL: ${f.id} — ${f.reason}`);
      }
    }
    if (scriptMissing.length > 0) {
      console.warn(`${stamp} Gates with missing scripts on disk: ${scriptMissing.length}`);
      for (const s of scriptMissing) {
        console.warn(`  DRIFT: ${s.id} → ${s.script} not found`);
      }
    }
    if (stubs.length > 0 && VERBOSE) {
      console.warn(`${stamp} Stub gates (need real fixtures to prove behavior):`);
      for (const s of stubs) {
        const parts = [];
        if (s.violatingIsStub) parts.push('violating=stub');
        if (s.passingIsStub) parts.push('passing=stub');
        console.warn(`  STUB: ${s.id} (${parts.join(', ')})`);
      }
    } else if (stubs.length > 0) {
      console.warn(`${stamp} ${stubs.length} gate(s) have stub fixtures — see --verbose for list`);
    }
  }

  // Exit conditions:
  //   1 = any missing fixtures OR any real fixture proof-of-firing failure
  //   0 = all accounted for (stubs warn, real passes)
  if (missing.length > 0 || failures.length > 0) {
    if (!JSON_MODE) {
      if (missing.length > 0) {
        console.error(
          `[validate-fixture-proof-of-firing] ✗ ${missing.length} gate(s) are missing fixture files. Run: node scripts/validate-fixture-proof-of-firing.mjs to see details.`,
        );
      }
    }
    process.exit(1);
  }

  if (!JSON_MODE) {
    console.log(
      `[validate-fixture-proof-of-firing] ✓ All ${total} gates accounted for (${withRealFixtures} real, ${withStubFixtures} stubs)`,
    );
  }
  process.exit(0);
}

validate();
