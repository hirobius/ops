#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/check-unit-overlap.mjs
 *
 * Pre-dispatch unit-overlap detector. Given a unit ID about to be claimed,
 * checks whether any currently in-flight (status: "claimed") unit is also
 * touching the same file paths. Refuses to proceed when overlap is detected.
 *
 * Implements the deterministic gate for Mario Zechner's parallel-pod safety
 * rule: two agents must NEVER touch the same file simultaneously.
 *
 * File-path inference (best-effort):
 *   1. If the unit has an explicit `touches: []` field, that array is used
 *      as-is (preferred, unambiguous).
 *   2. Otherwise, the `description`, `agentNotes[]`, and `validationCmd`
 *      fields are scanned for tokens matching the FILE_PATH_RE regex
 *      (same regex as swarm-watchdog.mjs). Globs are ignored.
 *
 * Overlap definition: candidate unit's inferred/explicit paths intersect
 * with ANY in-flight (status: "claimed") unit's inferred/explicit paths.
 * Empty intersection → exit 0 (safe to claim).
 * Non-empty intersection → exit 1 with a clear message.
 *
 * False-positive tolerance: "lean toward refusing on weak matches" per spec.
 *
 * Usage:
 *   node scripts/check-unit-overlap.mjs --unit <id>
 *     Check whether claiming <id> is safe given current orchestration state.
 *     Reads docs/ai/orchestration.json by default.
 *     Exit 0 = safe. Exit 1 = overlap detected (message printed to stderr).
 *
 *   node scripts/check-unit-overlap.mjs --unit <id> --orch <path>
 *     Same but uses a custom orchestration.json path (used by --self-test).
 *
 *   node scripts/check-unit-overlap.mjs --self-test
 *     Runs all fixture scenarios in scripts/__tests__/fixtures/overlap/.
 *     Exit 0 only when ALL sub-tests pass.
 *
 * Self-test fixtures (bundled in scripts/__tests__/fixtures/overlap/):
 *   good-no-overlap.orch.json              — approved unit has no file overlap → expect exit 0
 *   bad-shared-script.orch.json            — inferred overlap on scripts/check-x.mjs → expect exit 1
 *   bad-shared-component.orch.json         — inferred overlap on src/components/Foo.tsx → expect exit 1  // token-path-ok: fixture filename, not a source path
 *   good-explicit-touches-no-overlap.orch.json — explicit touches, disjoint paths → expect exit 0
 *   bad-explicit-touches-overlap.orch.json    — explicit touches, overlapping paths → expect exit 1
 *   good-no-inflight.orch.json             — no claimed units in flight → expect exit 0
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_ORCH = path.join(ROOT, 'docs/ai/orchestration.json');
const FIXTURES_DIR = path.join(ROOT, 'scripts/__tests__/fixtures/overlap');

// Same regex used by swarm-watchdog.mjs — must stay in sync.
// Matches path-like tokens anchored at known top-level dirs.
const FILE_PATH_RE = /\b((?:src|public|docs|scripts|tests|api|fixtures|\.husky|\.claude)\/[A-Za-z0-9_./-]+)/g;

// ── Path inference ────────────────────────────────────────────────────────────

/**
 * Extract the set of file paths a unit is expected to touch.
 * Prefers the explicit `touches` field; falls back to regex scanning.
 * @param {object} unit
 * @returns {Set<string>}
 */
function extractPaths(unit) {
  // Explicit field wins — unambiguous, no inference needed.
  if (Array.isArray(unit.touches) && unit.touches.length > 0) {
    return new Set(unit.touches.map(normalizePath));
  }

  // Inference: scan description + agentNotes for path-like tokens.
  // validationCmd is intentionally excluded — it names the *runner*, not a
  // file the unit modifies. Including it would cause false positives whenever
  // two units use the same validation script (e.g. validate-manifest.mjs).
  const corpus = [
    unit.description || '',
    ...(Array.isArray(unit.agentNotes) ? unit.agentNotes : []),
  ].join('\n');

  const out = new Set();
  // Reset lastIndex before exec loop (regex is stateful with /g flag).
  FILE_PATH_RE.lastIndex = 0;
  let m;
  while ((m = FILE_PATH_RE.exec(corpus)) !== null) {
    const p = m[1].replace(/[)\].,;:'"]+$/, '');  // strip trailing punctuation
    if (p.includes('*')) continue;                   // skip globs
    out.add(normalizePath(p));
  }
  return out;
}

function normalizePath(p) {
  return p.replace(/^\.\//, '').toLowerCase();
}

// ── Core check ────────────────────────────────────────────────────────────────

/**
 * Check whether claiming `unitId` is safe given the provided orchestration data.
 *
 * @param {string}  unitId       The candidate unit to claim.
 * @param {object}  orchData     Parsed orchestration.json (must have .units[]).
 * @returns {{ safe: boolean, conflicts: Array<{unitId: string, paths: string[]}> }}
 */
function checkOverlap(unitId, orchData) {
  const units = orchData.units || [];

  const candidate = units.find(u => u.id === unitId);
  if (!candidate) {
    return { safe: false, conflicts: [], error: `Unit not found: ${unitId}` };
  }

  const candidatePaths = extractPaths(candidate);

  // In-flight = currently claimed by another agent.
  const inFlight = units.filter(u => u.status === 'claimed' && u.id !== unitId);

  const conflicts = [];
  for (const inflight of inFlight) {
    const inflightPaths = extractPaths(inflight);
    const shared = [...candidatePaths].filter(p => inflightPaths.has(p));
    if (shared.length > 0) {
      conflicts.push({ unitId: inflight.id, paths: shared });
    }
  }

  return { safe: conflicts.length === 0, conflicts };
}

// ── CLI: --unit mode ──────────────────────────────────────────────────────────

function runCheck(unitId, orchPath) {
  if (!fs.existsSync(orchPath)) {
    process.stderr.write(`[check-unit-overlap] ERROR: orchestration file not found: ${orchPath}\n`);
    process.exit(2);
  }

  let orchData;
  try {
    orchData = JSON.parse(fs.readFileSync(orchPath, 'utf8'));
  } catch (e) {
    process.stderr.write(`[check-unit-overlap] ERROR: cannot parse orchestration file: ${e.message}\n`);
    process.exit(2);
  }

  const result = checkOverlap(unitId, orchData);

  if (result.error) {
    process.stderr.write(`[check-unit-overlap] ERROR: ${result.error}\n`);
    process.exit(2);
  }

  if (result.safe) {
    process.stdout.write(`[check-unit-overlap] OK — claiming '${unitId}' is safe (no in-flight path overlap)\n`);
    process.exit(0);
  } else {
    process.stderr.write(`[check-unit-overlap] REFUSE — '${unitId}' overlaps with in-flight unit(s):\n`);
    for (const conflict of result.conflicts) {
      process.stderr.write(`  - Unit '${conflict.unitId}' shares path(s): ${conflict.paths.join(', ')}\n`);
    }
    process.stderr.write(`[check-unit-overlap] Claim aborted. Wait for in-flight unit(s) to complete or choose a different unit.\n`);
    process.exit(1);
  }
}

// ── Self-test ─────────────────────────────────────────────────────────────────

/**
 * Each scenario: { fixture, unitId, expectSafe, label }
 * expectSafe=true → check must exit 0 (no overlap)
 * expectSafe=false → check must exit 1 (overlap detected)
 */
const SELF_TEST_SCENARIOS = [
  {
    fixture: 'good-no-overlap.orch.json',
    unitId: 'unit-beta',
    expectSafe: true,
    label: 'good-no-overlap: approved unit touches disjoint file → safe',
  },
  {
    fixture: 'bad-shared-script.orch.json',
    unitId: 'unit-checker-b',
    expectSafe: false,
    label: 'bad-shared-script: inferred overlap on scripts/check-x.mjs → refuse',
  },
  {
    fixture: 'bad-shared-component.orch.json', // token-path-ok: fixture filename, not a source path
    unitId: 'unit-comp-b',
    expectSafe: false,
    label: 'bad-shared-component: inferred overlap on src/components/Foo.tsx → refuse',
  },
  {
    fixture: 'good-explicit-touches-no-overlap.orch.json',
    unitId: 'unit-explicit-b',
    expectSafe: true,
    label: 'good-explicit-touches-no-overlap: explicit disjoint touches → safe',
  },
  {
    fixture: 'bad-explicit-touches-overlap.orch.json',
    unitId: 'unit-explicit-overlap-b',
    expectSafe: false,
    label: 'bad-explicit-touches-overlap: explicit intersecting touches → refuse',
  },
  {
    fixture: 'good-no-inflight.orch.json',
    unitId: 'unit-approved-x',
    expectSafe: true,
    label: 'good-no-inflight: no claimed units in flight → safe',
  },
];

function runSelfTest() {
  let passed = 0;
  let failed = 0;

  for (const scenario of SELF_TEST_SCENARIOS) {
    const fixturePath = path.join(FIXTURES_DIR, scenario.fixture);

    if (!fs.existsSync(fixturePath)) {
      process.stderr.write(`  [FAIL] ${scenario.label}\n`);
      process.stderr.write(`         fixture not found: ${fixturePath}\n`);
      failed++;
      continue;
    }

    let orchData;
    try {
      orchData = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    } catch (e) {
      process.stderr.write(`  [FAIL] ${scenario.label}\n`);
      process.stderr.write(`         cannot parse fixture: ${e.message}\n`);
      failed++;
      continue;
    }

    const result = checkOverlap(scenario.unitId, orchData);

    if (result.error) {
      process.stderr.write(`  [FAIL] ${scenario.label}\n`);
      process.stderr.write(`         error: ${result.error}\n`);
      failed++;
      continue;
    }

    const gotSafe = result.safe;
    if (gotSafe === scenario.expectSafe) {
      process.stdout.write(`  [PASS] ${scenario.label}\n`);
      passed++;
    } else {
      process.stderr.write(`  [FAIL] ${scenario.label}\n`);
      process.stderr.write(`         expected safe=${scenario.expectSafe}, got safe=${gotSafe}\n`);
      if (!gotSafe && result.conflicts.length > 0) {
        for (const c of result.conflicts) {
          process.stderr.write(`         conflict: unit='${c.unitId}' paths=${c.paths.join(',')}\n`);
        }
      }
      failed++;
    }
  }

  const total = SELF_TEST_SCENARIOS.length;
  process.stdout.write(`\n[check-unit-overlap] Self-test: ${passed}/${total} passed, ${failed}/${total} failed\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.stdout.write(`[check-unit-overlap] All self-tests passed.\n`);
    process.exit(0);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const isFixtureMode = argv.includes('--fixture-mode') || process.env.HDS_FIXTURE_MODE === '1';
const fixtureFile = process.env.FIXTURE_FILE;

if (isFixtureMode && fixtureFile) {
  // Fixture mode: use FIXTURE_FILE as the orchestration file.
  // Checks the first unit with status 'approved' in the fixture.
  const orchPath = path.resolve(fixtureFile);
  if (!fs.existsSync(orchPath)) {
    process.stderr.write(`[check-unit-overlap] fixture file not found: ${orchPath}\n`);
    process.exit(2);
  }
  let orchData;
  try {
    orchData = JSON.parse(fs.readFileSync(orchPath, 'utf8'));
  } catch (e) {
    process.stderr.write(`[check-unit-overlap] cannot parse fixture: ${e.message}\n`);
    process.exit(2);
  }
  const approvedUnit = (orchData.units || []).find(u => u.status === 'approved');
  if (!approvedUnit) {
    process.stderr.write('[check-unit-overlap] fixture has no approved unit to check\n');
    process.exit(2);
  }
  runCheck(approvedUnit.id, orchPath);
} else if (argv.includes('--self-test') || argv.length === 0) {
  // When invoked with no args (e.g. from run-gates --channel manual), run the
  // self-test suite as a smoke check and exit 0 on success.
  runSelfTest();
} else {
  const unitIdx = argv.indexOf('--unit');
  const orchIdx = argv.indexOf('--orch');

  if (unitIdx === -1 || !argv[unitIdx + 1]) {
    process.stderr.write('Usage: node scripts/check-unit-overlap.mjs --unit <id> [--orch <path>]\n');
    process.stderr.write('       node scripts/check-unit-overlap.mjs --self-test\n');
    process.exit(2);
  }

  const unitId  = argv[unitIdx + 1];
  const orchPath = orchIdx !== -1 && argv[orchIdx + 1]
    ? path.resolve(argv[orchIdx + 1])
    : DEFAULT_ORCH;

  runCheck(unitId, orchPath);
}
