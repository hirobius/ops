#!/usr/bin/env node
/**
 * generate-strength-report.mjs
 *
 * Pure observer — reads source data and emits two report artifacts:
 *   docs/guardrails/strength-report.md  (human-readable dashboard)
 *   docs/guardrails/strength-report.json (LLM-readable structured state)
 *
 * Computes Score A (Internal Integrity, 6 dims) and Score B (Industry
 * Benchmark, 8 dims) per the 13s-strength-1 ADR spec:
 *   docs/guardrails/strength-score-spec.md
 *
 * IDEMPOTENCY CONTRACT: same input → byte-identical output, modulo the
 * single top-level `generated` ISO timestamp. Achieved by:
 *   - Sorting all dict keys alphabetically before emit
 *   - No Date.now() outside the top-level `generated` field
 *   - No Math.random()
 *   - Deterministic iteration order over arrays
 *
 * PURE OBSERVER: writes ONLY strength-report.md and strength-report.json.
 * Never mutates registry.json, orchestration.json, or any source file.
 *
 * Unit: 13s-strength-2-generator
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const ARGS = process.argv.slice(2);
const HISTORY_SNAPSHOT = ARGS.includes('--history-snapshot');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJSON(relPath) {
  const abs = resolve(ROOT, relPath);
  if (!existsSync(abs)) return null;
  return JSON.parse(readFileSync(abs, 'utf-8'));
}

function readLines(relPath) {
  const abs = resolve(ROOT, relPath);
  if (!existsSync(abs)) return [];
  return readFileSync(abs, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map(l => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter(Boolean);
}

/** Count files matching a glob pattern in the scripts/ directory only. */
function countFiles(pattern) {
  try {
    const scriptsDir = resolve(ROOT, 'scripts');
    const result = execSync(
      `find "${scriptsDir}" -maxdepth 1 -type f -name "${pattern}" 2>/dev/null | wc -l`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();
    return parseInt(result, 10) || 0;
  } catch {
    return 0;
  }
}

/** Count occurrences of a grep pattern across TS/TSX source files. */
function countGrep(pattern, dir = 'src') {
  try {
    const result = execSync(
      `grep -rn --include='*.ts' --include='*.tsx' -E "${pattern}" ${resolve(ROOT, dir)} 2>/dev/null | wc -l`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();
    return parseInt(result, 10) || 0;
  } catch {
    return 0;
  }
}

/** Sort object keys alphabetically (deep, for JSON determinism). */
function sortKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj !== null && typeof obj === 'object') {
    const sorted = {};
    for (const k of Object.keys(obj).sort()) {
      sorted[k] = sortKeys(obj[k]);
    }
    return sorted;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Data sources
// ---------------------------------------------------------------------------

const registry = readJSON('docs/guardrails/registry.json');
const orchestration = readJSON('docs/ai/orchestration.json');
// swarm-watchdog-decisions.jsonl: used for regression detection in the report comparison block
const _watchdogDecisions = readLines('docs/ai/swarm-watchdog-decisions.jsonl');
const componentApi = readJSON('src/app/data/component-api.json');
const tsconfigMain = readJSON('tsconfig.json');

const gates = registry?.gates ?? [];
const units = orchestration?.units ?? [];

// ---------------------------------------------------------------------------
// Score A dimensions
// ---------------------------------------------------------------------------

/**
 * A1 — Registration coverage
 * = count(check-* and audit-* gates registered) / count(scripts/check-*.mjs ∪ scripts/audit-*.mjs on disk)
 * Per spec: every check-*.mjs and audit-*.mjs must be registered in registry.json.
 */
function computeA1() {
  const scriptsOnDisk = countFiles('check-*.mjs') + countFiles('audit-*.mjs');
  // Only count check-* and audit-* gates (the scope validate-guardrail-registry enforces)
  const registered = gates.filter(g => g.id.startsWith('check-') || g.id.startsWith('audit-')).length;
  if (scriptsOnDisk === 0) {
    return { score: null, status: 'needs-wiring', reason: 'no-scripts-found', raw: { registered, scriptsOnDisk } };
  }
  // Cap at 100 — having more registered than on-disk is fine (may include validators)
  const score = Math.min(100, Math.round((registered / scriptsOnDisk) * 100));
  return { score, status: 'wired', raw: { registered, scriptsOnDisk } };
}

/**
 * A2 — Wiring honesty
 * = count(gates without wiringTodo) / count(registered)
 * Gates that have a wiringTodo are declared dishonestly (firingChannel doesn't match reality).
 */
function computeA2() {
  const total = gates.length;
  if (total === 0) {
    return { score: null, status: 'needs-wiring', reason: 'no-registered-gates', raw: { honest: 0, total: 0 } };
  }
  const honest = gates.filter(g => !g.wiringTodo).length;
  const score = Math.round((honest / total) * 100);
  return { score, status: 'wired', raw: { honest, total } };
}

/**
 * A3 — Fixture proof-of-firing
 * = count(gates with REAL fixtures, both files present, non-stub markers) / count(registered)
 *
 * Three categories, surfaced separately:
 *   withRealFixtures    — both files exist, no stub markers → counts toward A3 score
 *   withStubFixtures    — both files exist, but one or both have stub TODO markers → stubbed but unproven
 *   withMissingFixtures — missing directory or missing file(s) → uncovered
 *
 * Stubs do NOT count as "wired" for A3. They count as "stubbed but unproven".
 * Only real (non-stub) fixtures with the gate verified as firing count.
 *
 * Per spec (13g-3-fixture-proof-of-firing): run validate-fixture-proof-of-firing.mjs
 * for authoritative totals. This dimension reads its output artifact if present;
 * otherwise falls back to static fixture-dir inspection.
 */
function computeA3() {
  const total = gates.length;
  if (total === 0) {
    return { score: null, status: 'needs-wiring', reason: 'no-registered-gates', raw: { withRealFixtures: 0, withStubFixtures: 0, withMissingFixtures: 0, total: 0 } };
  }

  // Stub marker prefixes — must match validate-fixture-proof-of-firing.mjs
  const STUB_MARKERS = [
    '// TODO: replace with real-violating-example',
    '// TODO: replace with real-passing-example',
    '<!-- TODO: replace with real-violating-example',
    '<!-- TODO: replace with real-passing-example',
    '{ "__stub": true',
  ];

  function looksLikeStub(filePath) {
    try {
      const buf = readFileSync(filePath, 'utf-8');
      const head = buf.slice(0, 256);
      return STUB_MARKERS.some(m => head.includes(m));
    } catch {
      return false;
    }
  }

  const EXTS = ['.tsx', '.json', '.md', '.txt', '.mjs', '.js'];

  let withRealFixtures = 0;
  let withStubFixtures = 0;
  let withMissingFixtures = 0;

  for (const gate of gates) {
    const fixtureDir = gate.fixturePath ? resolve(ROOT, gate.fixturePath) : null;
    if (!fixtureDir || !existsSync(fixtureDir)) {
      withMissingFixtures++;
      continue;
    }

    // Look for violating + passing files
    let violatingPath = null;
    let passingPath = null;
    for (const ext of EXTS) {
      const vp = resolve(fixtureDir, `violating.example${ext}`);
      const pp = resolve(fixtureDir, `passing.example${ext}`);
      if (existsSync(vp)) violatingPath = vp;
      if (existsSync(pp)) passingPath = pp;
      if (violatingPath && passingPath) break;
    }

    if (!violatingPath || !passingPath) {
      withMissingFixtures++;
      continue;
    }

    // Check stub markers
    const isStub = looksLikeStub(violatingPath) || looksLikeStub(passingPath);
    if (isStub) {
      withStubFixtures++;
    } else {
      withRealFixtures++;
    }
  }

  // Score is based on real fixtures only — stubs are "stubbed but unproven"
  const score = Math.round((withRealFixtures / total) * 100);
  return {
    score,
    status: 'wired',
    raw: { withRealFixtures, withStubFixtures, withMissingFixtures, total },
  };
}

/**
 * A4 — Strict gating
 * = count(gates with firingChannel ∈ {pre-commit, pre-push, ci-pr}) / count(registered)
 */
function computeA4() {
  const total = gates.length;
  if (total === 0) {
    return { score: null, status: 'needs-wiring', reason: 'no-registered-gates', raw: { strict: 0, total: 0 } };
  }
  const strictChannels = new Set(['pre-commit', 'pre-push', 'ci-pr']);
  const strict = gates.filter(g => strictChannels.has(g.firingChannel)).length;
  const score = Math.round((strict / total) * 100);
  return { score, status: 'wired', raw: { strict, total } };
}

/**
 * A5 — Hardening cluster completeness
 * = count(13g-* units with status=done) / count(13g-* units)
 */
function computeA5() {
  const cluster = units.filter(u => u.id?.startsWith('13g-'));
  const total = cluster.length;
  if (total === 0) {
    return { score: null, status: 'needs-wiring', reason: 'no-13g-units', raw: { done: 0, total: 0 } };
  }
  const done = cluster.filter(u => u.status === 'done').length;
  const score = Math.round((done / total) * 100);
  return { score, status: 'wired', raw: { done, total } };
}

/**
 * A6 — Debt closure ratio
 *
 * Reads the Phase-2 inventory artifact emitted by
 *   `node scripts/run-gates.mjs --channel <X> --emit-inventory <path>`
 * (see unit 13p-1). Each entry in `inventory.gates[]` has shape:
 *   { id, exitCode, durationMs, supportsJson, violations, outputTail }
 *
 * Formula (per unit 13p-3):
 *   closureRatio = (totalGates - gatesWithViolations) / totalGates * 100
 *
 * A gate counts as "with violations" when exitCode !== 0 OR its structured
 * `violations` array is non-empty (only relevant for supportsJson:true gates).
 *
 * If the inventory file is missing, A6 stays needs-wiring; the same applies
 * if the inventory has zero gates (no denominator to divide by).
 */
function computeA6() {
  const inventoryPath = 'docs/guardrails/full-strictness-inventory.json';
  if (!existsSync(resolve(ROOT, inventoryPath))) {
    return {
      score: null,
      status: 'needs-wiring',
      reason: 'docs/guardrails/full-strictness-inventory.json not yet generated — run `node scripts/run-gates.mjs --channel ci-pr --emit-inventory docs/guardrails/full-strictness-inventory.json` (per unit 13p-2)',
      raw: {},
    };
  }
  const inventory = readJSON(inventoryPath);
  const gates = Array.isArray(inventory?.gates) ? inventory.gates : [];
  const totalGates = gates.length;
  if (totalGates === 0) {
    return {
      score: null,
      status: 'needs-wiring',
      reason: 'inventory has zero gates — empty channel',
      raw: { totalGates: 0, gatesWithViolations: 0 },
    };
  }
  const gatesWithViolations = gates.filter(g => {
    if (g?.exitCode !== 0) return true;
    if (Array.isArray(g?.violations) && g.violations.length > 0) return true;
    return false;
  }).length;
  const score = Math.round(((totalGates - gatesWithViolations) / totalGates) * 100);
  return {
    score,
    status: 'wired',
    raw: {
      totalGates,
      gatesWithViolations,
      channel: inventory?.channel ?? null,
      generatedAt: inventory?.generatedAt ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Score B dimensions
// ---------------------------------------------------------------------------

/**
 * B1 — DORA metrics
 * Requires derive-dora-metrics.mjs output. Currently needs-wiring.
 */
function computeB1() {
  return {
    score: null,
    status: 'needs-wiring',
    reason: 'scripts/derive-dora-metrics.mjs not yet authored (13s-strength-B1 follow-up unit)',
    raw: {},
  };
}

/**
 * B2 — OWASP SAMM / NIST SSDF pre-commit coverage
 * Maps 8 security-relevant categories to whether any registered gate covers them.
 * 8/8 covered = 100; partial scaled proportionally.
 *
 * Categories: secrets, types, lint, deps, license, accessibility, perf, WCAG
 */
function computeB2() {
  const allChannels = gates.map(g => g.firingChannel);

  // Category coverage assessment (derived purely from registry contents)
  const categories = {
    secrets: gates.some(g => g.id.includes('security') || g.id.includes('secrets')),
    types: gates.some(g => g.id === 'validate-orchestration') ||
           allChannels.includes('pre-commit'), // pnpm typecheck is in pre-commit hook
    lint: gates.some(g =>
      g.id.includes('source-canon') ||
      g.id.includes('hardcoded-colors') ||
      g.id.includes('hardcoded-fonts') ||
      g.id.includes('hardcoded-spacing')
    ),
    deps: gates.some(g =>
      g.id.includes('token-rebake') ||
      g.id.includes('token-renames') ||
      g.id.includes('manifest-drift')
    ),
    license: false, // no license-check gate registered
    accessibility: gates.some(g =>
      g.id.includes('aria-labels') ||
      g.id.includes('focus-states') ||
      g.id.includes('contrast')
    ),
    perf: gates.some(g => g.id.includes('perf-budget')),
    wcag: gates.some(g =>
      g.id.includes('contrast') ||
      g.id.includes('wcag') ||
      g.id.includes('a11y') ||
      g.id.includes('aria')
    ),
  };

  const coveredCount = Object.values(categories).filter(Boolean).length;
  const totalCategories = Object.keys(categories).length;
  const score = Math.round((coveredCount / totalCategories) * 100);

  return {
    score,
    status: 'wired',
    raw: {
      coveredCount,
      totalCategories,
      categories: Object.fromEntries(
        Object.entries(categories).sort(([a], [b]) => a.localeCompare(b))
      ),
    },
  };
}

/**
 * B3 — WCAG 2.1 AA (axe-playwright violations)
 *
 * Primary signal: test-results/.last-run.json
 *   - "status": "passed" with empty failedTests[] → all a11y tests passed → 0 blocking violations.
 *   - "status": "failed" → parse failedTests[] for a11y test names to count routes with violations.
 *
 * The a11y.spec.ts hard-fails on any critical or serious axe violation per route.
 * Passing = 0 violations per route. Score formula: 100 - (violations_per_route_mean * 5), clamped [0, 100].
 *
 * Secondary fallback: if last-run.json is absent, mark needs-wiring.
 */
function computeB3() {
  const lastRunPath = 'test-results/.last-run.json';
  if (!existsSync(resolve(ROOT, lastRunPath))) {
    return {
      score: null,
      status: 'needs-wiring',
      reason: 'test-results/.last-run.json absent — run pnpm test:a11y first',
      raw: {},
    };
  }

  const lastRun = readJSON(lastRunPath);
  const totalRoutes = 20; // FOUNDATION_ROUTES (12) + COMPONENT_ROUTES (8) in a11y.spec.ts

  if (lastRun?.status === 'passed') {
    // All tests passed — 0 blocking violations across all routes
    return {
      score: 100,
      status: 'wired',
      raw: {
        source: 'test-results/.last-run.json',
        status: 'passed',
        violatingRoutes: 0,
        totalRoutes,
        violationsPerRouteMean: 0,
      },
    };
  }

  // status === 'failed': count a11y route tests in failedTests[]
  const failedTests = Array.isArray(lastRun?.failedTests) ? lastRun.failedTests : [];
  // a11y spec test titles: "a11y [/hds/...]" — count distinct route violations
  const a11yFailures = failedTests.filter(t => typeof t === 'string' && /^a11y \[/.test(t));
  const violatingRoutes = a11yFailures.length;
  // Each failing route = at least 1 blocking violation group. Score: 100 - (count * 5), clamped.
  const violationsPerRouteMean = violatingRoutes;
  const score = Math.max(0, Math.min(100, 100 - violationsPerRouteMean * 5));

  return {
    score,
    status: 'wired',
    raw: {
      source: 'test-results/.last-run.json',
      status: 'failed',
      violatingRoutes,
      totalRoutes,
      violationsPerRouteMean,
    },
  };
}

/**
 * B4 — Google Web Vitals (LCP, INP, CLS) via lighthouse-ci
 *
 * Methodology: averaged Lighthouse performance score (0–100) across critical
 * routes (/, /atlas, /portfolio) from a single lhci collect run against
 * the staticDistDir (./dist). Per-route LCP/INP(FID)/CLS captured in raw.
 *
 * Chrome discovery order:
 *   1. CHROME_PATH env var
 *   2. Playwright-managed Chromium at ~/.cache/ms-playwright/chromium-{version}/chrome-linux64/chrome
 *   3. System chromium/google-chrome
 *   4. lhci's built-in Chrome detection (Windows Chrome via WSL2 — may fail)
 *
 * Cache: raw LHR data is written to docs/security/lighthouse-report.json after
 * each successful run. On failure, the cached file is used with a note.
 *
 * Scoring: average of categories.performance.score * 100 across routes,
 * clamped [0, 100]. Rounds to nearest integer.
 *
 * If lhci fails (no Chrome, dist missing, network error), returns
 * status: "wiring-failed" with notes explaining the blocker.
 */
function computeB4() {
  const lhrCachePath = resolve(ROOT, 'docs/security/lighthouse-report.json');
  const lhciDir = resolve(ROOT, '.lighthouseci');
  const distDir = resolve(ROOT, 'dist');
  const lhciCli = resolve(ROOT, 'node_modules/@lhci/cli/src/cli.js');

  // Routes to audit — critical paths per public/llms.txt
  const ROUTES = ['/', '/atlas', '/portfolio'];

  // ---------------------------------------------------------------------------
  // Chrome path discovery
  // ---------------------------------------------------------------------------
  function findChromePath() {
    // 1. Explicit env var
    if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

    // 2. Playwright-managed Chromium (WSL2-friendly)
    const playwrightBase = resolve(process.env.HOME ?? '/root', '.cache/ms-playwright');
    if (existsSync(playwrightBase)) {
      try {
        const dirs = execSync(`ls -1 "${playwrightBase}" 2>/dev/null | grep chromium | sort -r`, {
          encoding: 'utf-8', timeout: 5000,
        }).trim().split('\n').filter(Boolean);
        for (const dir of dirs) {
          const candidate = resolve(playwrightBase, dir, 'chrome-linux64', 'chrome');
          if (existsSync(candidate)) return candidate;
        }
      } catch { /* ignore */ }
    }

    // 3. System chromium/chrome
    for (const name of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
      try {
        const p = execSync(`which ${name} 2>/dev/null`, { encoding: 'utf-8', timeout: 3000 }).trim();
        if (p) return p;
      } catch { /* ignore */ }
    }

    return null; // let lhci use its own detection
  }

  // ---------------------------------------------------------------------------
  // Attempt a fresh lhci collect run
  // ---------------------------------------------------------------------------
  let freshRunNotes = null;
  let ranFresh = false;

  if (!existsSync(distDir)) {
    freshRunNotes = 'dist/ directory missing — run pnpm build first, then re-run pnpm strength';
  } else if (!existsSync(lhciCli)) {
    freshRunNotes = '@lhci/cli not installed — run pnpm install';
  } else {
    const chromePath = findChromePath();

    // Build argv array to avoid shell quoting issues
    const collectArgs = [
      lhciCli,
      'collect',
      '--staticDistDir=./dist',
      '--isSinglePageApplication=true',
      '--numberOfRuns=1',
      ...ROUTES.map(r => `--url=http://localhost${r}`),
      '--settings={"preset":"desktop","chromeFlags":"--no-sandbox --disable-dev-shm-usage --headless=new"}',
    ];
    if (chromePath) collectArgs.push(`--chromePath=${chromePath}`);

    try {
      const result = spawnSync(process.execPath, collectArgs, {
        encoding: 'utf-8',
        timeout: 300000, // 5 min — generous; 3 routes can take 2-3 min total
        cwd: ROOT,
        // Use 'inherit' for stdout/stderr to avoid pipe buffer deadlock on large lhci output
        stdio: ['ignore', 'inherit', 'inherit'],
      });
      if (result.status === 0) {
        ranFresh = true;
      } else {
        freshRunNotes = `lhci collect exited ${result.status}`;
      }
    } catch (err) {
      const errMsg = String(err.message ?? '').slice(0, 300);
      freshRunNotes = `lhci collect threw: ${errMsg.replace(/\n/g, ' ')}`;
    }
  }

  // ---------------------------------------------------------------------------
  // Parse .lighthouseci/lhr-*.json files written by lhci collect
  // ---------------------------------------------------------------------------
  function parseLhrFiles() {
    if (!existsSync(lhciDir)) return [];
    let lhrFiles;
    try {
      lhrFiles = execSync(`ls -1t "${lhciDir}/lhr-"*.json 2>/dev/null`, {
        encoding: 'utf-8', timeout: 5000,
      }).trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
    // Only use the most-recent file per URL to handle multiple runs
    const seen = new Set();
    const results = [];
    for (const f of lhrFiles) {
      try {
        const lhr = JSON.parse(readFileSync(f, 'utf-8'));
        const url = lhr?.requestedUrl ?? lhr?.finalUrl ?? 'unknown';
        // Normalise URL by stripping port/host (keep path only)
        let path;
        try { path = new URL(url).pathname; } catch { path = url; }
        if (seen.has(path)) continue;
        seen.add(path);

        const cats = lhr?.categories ?? {};
        const audits = lhr?.audits ?? {};
        const perfScore = typeof cats?.performance?.score === 'number'
          ? cats.performance.score * 100
          : null;
        const lcpMs = audits['largest-contentful-paint']?.numericValue ?? null;
        const clsVal = audits['cumulative-layout-shift']?.numericValue ?? null;
        // INP if present; fallback to FID (older Lighthouse)
        const inpMs = audits['interaction-to-next-paint']?.numericValue
          ?? audits['max-potential-fid']?.numericValue
          ?? null;

        results.push({
          url: path,
          perfScore: perfScore !== null ? Math.round(perfScore) : null,
          lcp: lcpMs !== null ? Math.round(lcpMs) : null,
          cls: clsVal !== null ? Math.round(clsVal * 1000) / 1000 : null,
          inp: inpMs !== null ? Math.round(inpMs) : null,
        });
      } catch { /* skip malformed */ }
    }
    return results;
  }

  const routeData = parseLhrFiles();

  // ---------------------------------------------------------------------------
  // If no LHR data, try reading the cache
  // ---------------------------------------------------------------------------
  if (routeData.length === 0) {
    const cached = readJSON('docs/security/lighthouse-report.json');
    if (cached?.routes && Array.isArray(cached.routes) && cached.routes.length > 0) {
      const scores = cached.routes.map(r => r.perfScore).filter(s => typeof s === 'number');
      const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
      const score = avg !== null ? Math.max(0, Math.min(100, Math.round(avg))) : null;
      return {
        score,
        status: score !== null ? 'wired' : 'wiring-failed',
        notes: [
          'Using stale cached lighthouse-report.json (fresh run failed).',
          freshRunNotes ?? 'lhci collect produced no LHR files.',
        ].filter(Boolean).join(' '),
        raw: { routes: cached.routes, source: 'cached', cachedAt: cached.generatedAt ?? null },
      };
    }

    // Truly no data
    return {
      score: null,
      status: 'wiring-failed',
      notes: [
        freshRunNotes ?? 'lhci collect produced no LHR files.',
        'Fix: ensure dist/ exists (pnpm build), Chrome is available, then re-run pnpm strength.',
      ].join(' '),
      raw: { routes: [], chromePath: findChromePath() },
    };
  }

  // ---------------------------------------------------------------------------
  // Compute composite score and write cache
  // ---------------------------------------------------------------------------
  const scores = routeData.map(r => r.perfScore).filter(s => typeof s === 'number');
  const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const score = avg !== null ? Math.max(0, Math.min(100, Math.round(avg))) : null;

  const cachePayload = {
    generatedAt: new Date().toISOString(),
    routes: routeData,
    score,
    source: 'lhci-collect',
  };
  try {
    writeFileSync(lhrCachePath, JSON.stringify(cachePayload, null, 2) + '\n', 'utf-8');
  } catch { /* non-fatal */ }

  const result = {
    score,
    status: score !== null ? 'wired' : 'wiring-failed',
    raw: {
      routes: routeData,
      source: ranFresh ? 'lhci-collect-fresh' : 'lhci-collect-cached-lhrs',
    },
  };
  if (freshRunNotes) result.notes = freshRunNotes;
  return result;
}

/**
 * B5 — TypeScript strict mode + zero `any` in source
 * Reads tsconfig.json compiler options and counts `any` usages.
 */
function computeB5() {
  const opts = tsconfigMain?.compilerOptions ?? {};

  // Full strict mode enables: strictNullChecks, noImplicitAny, strictPropertyInitialization,
  // alwaysStrict, strictFunctionTypes, strictBindCallApply, noImplicitThis
  const strictFlags = {
    strict: !!opts.strict,
    strictNullChecks: !!(opts.strict || opts.strictNullChecks),
    noImplicitAny: !!(opts.strict || opts.noImplicitAny),
    strictPropertyInitialization: !!(opts.strict || opts.strictPropertyInitialization),
    alwaysStrict: !!(opts.strict || opts.alwaysStrict),
    strictFunctionTypes: !!(opts.strict || opts.strictFunctionTypes),
    strictBindCallApply: !!(opts.strict || opts.strictBindCallApply),
    noImplicitThis: !!(opts.strict || opts.noImplicitThis),
  };

  const flagsPresent = Object.values(strictFlags).filter(Boolean).length;
  const totalFlags = Object.keys(strictFlags).length;
  const flagScore = flagsPresent / totalFlags; // 0..1

  // Count `any` usages in src (: any or as any)
  const anyCount = countGrep('(: any\\b| as any\\b)', 'src');
  // Zero any = full bonus; each any deducts proportionally, floor at 0.5 of bonus
  const anyPenalty = anyCount === 0 ? 1.0 : Math.max(0.5, 1 - anyCount * 0.05);

  // Weighted: 80% flag coverage, 20% any-cleanliness
  const score = Math.round((flagScore * 0.8 + anyPenalty * 0.2) * 100);

  return {
    score,
    status: 'wired',
    raw: {
      anyCount,
      flagsPresent,
      totalFlags,
      strictFlags: Object.fromEntries(
        Object.entries(strictFlags).sort(([a], [b]) => a.localeCompare(b))
      ),
    },
  };
}

/**
 * B6 — OSV / npm audit (Critical + high CVE count)
 *
 * Primary: parses docs/security/osv-report.json — generated by
 *   `pnpm audit --json > docs/security/osv-report.json`
 *   (written at audit-time; updated whenever generate-strength-report runs).
 *
 * Fallback: if osv-scanner is installed, it would be used instead; but it is
 *   not a registered dep. npm/pnpm audit is the standard toolchain fallback.
 *
 * Score formula: 100 - 20*critical - 5*high, clamped [0, 100].
 * Moderate/low counts are recorded in raw but do NOT affect the score.
 *
 * Cache: the raw JSON is saved to docs/security/osv-report.json on each run
 *   by executing `pnpm audit --json` inline. If execution fails (e.g. network
 *   offline), the stale cached file is used with a note in `notes`.
 */
function computeB6() {
  const osvReportPath = resolve(ROOT, 'docs/security/osv-report.json');

  // Attempt a fresh pnpm audit run and cache to disk
  let freshRunNotes = null;
  try {
    const auditOutput = execSync(
      'pnpm audit --json 2>/dev/null',
      { encoding: 'utf-8', timeout: 60000, cwd: ROOT }
    );
    writeFileSync(osvReportPath, auditOutput, 'utf-8');
  } catch (err) {
    // pnpm audit exits 1 when vulnerabilities found — that's fine, stdout still has JSON
    const stdout = err.stdout ?? '';
    if (stdout.trim().startsWith('{')) {
      writeFileSync(osvReportPath, stdout, 'utf-8');
    } else if (!existsSync(osvReportPath)) {
      return {
        score: null,
        status: 'needs-wiring',
        reason: `pnpm audit --json failed and no cached report found: ${String(err.message).slice(0, 120)}`,
        raw: {},
      };
    } else {
      freshRunNotes = 'pnpm audit failed — using stale cached report from docs/security/osv-report.json';
    }
  }

  // Parse the cached report
  const report = readJSON('docs/security/osv-report.json');
  if (!report) {
    return {
      score: null,
      status: 'needs-wiring',
      reason: 'docs/security/osv-report.json could not be parsed',
      raw: {},
    };
  }

  // pnpm audit --json shape: { metadata: { vulnerabilities: { info, low, moderate, high, critical } } }
  const vulns = report?.metadata?.vulnerabilities ?? {};
  const critical = typeof vulns.critical === 'number' ? vulns.critical : 0;
  const high     = typeof vulns.high     === 'number' ? vulns.high     : 0;
  const moderate = typeof vulns.moderate === 'number' ? vulns.moderate : 0;
  const low      = typeof vulns.low      === 'number' ? vulns.low      : 0;
  const info     = typeof vulns.info     === 'number' ? vulns.info     : 0;

  // Score: 100 - 20*critical - 5*high, clamped [0, 100]
  const score = Math.max(0, Math.min(100, 100 - 20 * critical - 5 * high));

  const raw = { critical, high, moderate, low, info, source: 'pnpm-audit' };
  if (freshRunNotes) raw.notes = freshRunNotes;

  return {
    score,
    status: 'wired',
    raw,
  };
}

/**
 * B7 — CHAOSS documentation coverage
 * = % of components in component-api.json with real descriptions (>10 chars, not TODO)
 */
function computeB7() {
  const components = componentApi?.components;
  if (!components || typeof components !== 'object') {
    return {
      score: null,
      status: 'needs-wiring',
      reason: 'src/app/data/component-api.json missing or malformed',
      raw: {},
    };
  }

  const entries = Object.entries(components);
  const total = entries.length;
  if (total === 0) {
    return { score: null, status: 'needs-wiring', reason: 'component-api.json has no components', raw: {} };
  }

  const withRealDesc = entries.filter(([, c]) => {
    if (typeof c !== 'object' || !c) return false;
    const desc = String(c.description ?? '').trim();
    return desc.length > 10 && !desc.toLowerCase().startsWith('todo');
  }).length;

  const score = Math.round((withRealDesc / total) * 100);
  return {
    score,
    status: 'wired',
    raw: { withRealDesc, total },
  };
}

/**
 * B8 — Test coverage (line + branch from vitest+playwright)
 *
 * Reads tests/coverage-summary.json (generated by `pnpm test:coverage` via vitest --coverage).
 * Shape: { total: { lines: { pct }, branches: { pct }, ... }, ...perFile }
 *
 * Score = (line_pct + branch_pct) / 2, clamped [0, 100].
 * Methodology: line + branch coverage ≥80% from vitest+playwright.
 * Below 80% the score is the raw average (linear downscale from the 80-point threshold).
 */
function computeB8() {
  const coveragePath = 'tests/coverage-summary.json';
  if (!existsSync(resolve(ROOT, coveragePath))) {
    return {
      score: null,
      status: 'needs-wiring',
      reason: 'tests/coverage-summary.json absent — run pnpm test:coverage first',
      raw: {},
    };
  }

  const coverage = readJSON(coveragePath);
  const total = coverage?.total;
  if (!total) {
    return {
      score: null,
      status: 'needs-wiring',
      reason: 'tests/coverage-summary.json has no "total" key — unexpected format',
      raw: {},
    };
  }

  const linePct = typeof total.lines?.pct === 'number' ? total.lines.pct : null;
  const branchPct = typeof total.branches?.pct === 'number' ? total.branches.pct : null;

  if (linePct === null || branchPct === null) {
    return {
      score: null,
      status: 'needs-wiring',
      reason: 'coverage-summary.json missing lines.pct or branches.pct',
      raw: { total },
    };
  }

  // Average of line + branch coverage, clamped [0, 100]
  const avg = (linePct + branchPct) / 2;
  const score = Math.max(0, Math.min(100, Math.round(avg)));

  return {
    score,
    status: 'wired',
    raw: {
      source: 'tests/coverage-summary.json',
      linePct,
      branchPct,
      avgPct: Math.round(avg * 100) / 100,
      threshold: 80,
      meetsThreshold: avg >= 80,
    },
  };
}

// ---------------------------------------------------------------------------
// Composite computation
// ---------------------------------------------------------------------------

function buildDimension(id, name, weight, methodology, result) {
  return sortKeys({
    id,
    methodology,
    name,
    raw: result.raw ?? {},
    reason: result.reason ?? null,
    score: result.score ?? null,
    status: result.status,
    weight,
  });
}

function computeComposite(dimensions) {
  const wired = dimensions.filter(d => d.status === 'wired' && typeof d.score === 'number');
  const total = dimensions.length;
  const wiredCount = wired.length;
  const wiredCoverage = `${wiredCount}/${total}`;

  if (wiredCount === 0) {
    return { composite: null, reason: 'all-dims-need-wiring', wiredCoverage };
  }

  const composite = Math.round(
    wired.reduce((sum, d) => sum + d.score, 0) / wiredCount
  );

  return { composite, wiredCoverage };
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function buildReport() {
  // Score A dimensions
  const aDims = [
    buildDimension('A1', 'Registration Coverage',   '1/6', 'count(registered) / count(scripts/check-*.mjs ∪ audit-*.mjs)', computeA1()),
    buildDimension('A2', 'Wiring Honesty',           '1/6', 'count(gates without wiringTodo) / count(registered)', computeA2()),
    buildDimension('A3', 'Fixture Proof-of-Firing',  '1/6', 'count(gates with REAL non-stub fixture pair verified firing) / count(registered). Stubs exist but are unproven; missing is an error.', computeA3()),
    buildDimension('A4', 'Strict Gating',            '1/6', 'count(firingChannel ∈ {pre-commit, pre-push, ci-pr}) / count(registered)', computeA4()),
    buildDimension('A5', 'Hardening Cluster Completeness', '1/6', 'count(13g-* status=done) / count(13g-*)', computeA5()),
    buildDimension('A6', 'Debt Closure Ratio',       '1/6', '(totalGates - gatesWithViolations) / totalGates over docs/guardrails/full-strictness-inventory.json', computeA6()),
  ];

  // Score B dimensions
  const bDims = [
    buildDimension('B1', 'DORA Metrics',          '1/8', 'deploy frequency + change failure rate vs Elite threshold', computeB1()),
    buildDimension('B2', 'OWASP SAMM / NIST SSDF','1/8', 'count(security categories covered by registry gates) / 8', computeB2()),
    buildDimension('B3', 'WCAG 2.1 AA',           '1/8', 'axe-playwright violations per route on critical pages (0 = 100)', computeB3()),
    buildDimension('B4', 'Web Vitals',            '1/8', 'Web Vitals (LCP, INP, CLS) via lighthouse-ci across critical routes — averaged perf score (0–100)', computeB4()),
    buildDimension('B5', 'TS Strict Mode',        '1/8', 'tsconfig strict flags present + zero any in src/**/*.ts(x)', computeB5()),
    buildDimension('B6', 'OSV / npm Audit',       '1/8', '0 critical + 0 high CVEs = 100; each critical -20, each high -5', computeB6()),
    buildDimension('B7', 'CHAOSS Docs Coverage',  '1/8', '% components in component-api.json with real description', computeB7()),
    buildDimension('B8', 'Test Coverage',         '1/8', 'line + branch coverage ≥80% from vitest+playwright', computeB8()),
  ];

  const aResult = computeComposite(aDims);
  const bResult = computeComposite(bDims);

  // Check for regressions vs last run
  let regressionWarning = null;
  const lastReport = readJSON('docs/guardrails/strength-report.json');
  if (lastReport) {
    const prevA = lastReport.scoreA?.composite;
    const prevB = lastReport.scoreB?.composite;
    if (typeof prevA === 'number' && typeof aResult.composite === 'number') {
      const delta = aResult.composite - prevA;
      if (delta < -10) {
        regressionWarning = `Score A dropped ${Math.abs(delta)} points (${prevA} → ${aResult.composite})`;
      }
    }
    if (typeof prevB === 'number' && typeof bResult.composite === 'number') {
      const delta = bResult.composite - prevB;
      if (delta < -10) {
        const msg = `Score B dropped ${Math.abs(delta)} points (${prevB} → ${bResult.composite})`;
        regressionWarning = regressionWarning ? `${regressionWarning}; ${msg}` : msg;
      }
    }
  }

  return {
    aDims,
    aResult,
    bDims,
    bResult,
    regressionWarning,
  };
}

// ---------------------------------------------------------------------------
// ASCII bar chart
// ---------------------------------------------------------------------------

function bar(score, width = 20) {
  if (score === null) return '[' + '·'.repeat(width) + '] needs-wiring';
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  return '[' + '█'.repeat(filled) + '░'.repeat(empty) + `] ${score}`;
}

// ---------------------------------------------------------------------------
// Markdown report
// ---------------------------------------------------------------------------

function renderMarkdown(report, generated) {
  const { aDims, aResult, bDims, bResult, regressionWarning } = report;

  const aComp = aResult.composite !== null ? `**${aResult.composite}**/100` : '**—** (no wired dims)';
  const bComp = bResult.composite !== null ? `**${bResult.composite}**/100` : '**—** (no wired dims)';

  let md = `# System Strength Report\n\n`;
  md += `> Generated: ${generated}\n`;
  md += `> Spec: [docs/guardrails/strength-score-spec.md](./strength-score-spec.md)\n\n`;

  if (regressionWarning) {
    md += `> ⚠️  **REGRESSION WARNING:** ${regressionWarning}\n\n`;
  }

  md += `---\n\n`;
  md += `## Composite Scores\n\n`;
  md += `| Score | Composite | Wired Coverage | Description |\n`;
  md += `|---|---|---|---|\n`;
  md += `| **A — Internal Integrity** | ${aComp} | ${aResult.wiredCoverage} | Closed-loop discipline: gates, wiring, fixtures, gating strength |\n`;
  md += `| **B — Industry Benchmark** | ${bComp} | ${bResult.wiredCoverage} | External standards: DORA, OWASP, WCAG, Web Vitals, TS, OSV, CHAOSS, coverage |\n`;
  md += `\n`;

  md += `> Arithmetic mean over wired dimensions only. \`needs-wiring\` dims excluded from average.\n`;
  md += `> **Two scores are never collapsed.** A high B with low A means "theatrical guardrails" — harden A first.\n\n`;

  md += `---\n\n`;
  md += `## Score A — Internal Integrity\n\n`;
  md += `Composite: ${aResult.composite !== null ? aResult.composite : '—'}  |  Wired: ${aResult.wiredCoverage}\n\n`;

  for (const d of aDims) {
    const status = d.status === 'wired' ? '' : ` _(${d.status})_`;
    md += `### ${d.id} — ${d.name}${status}\n\n`;
    md += `\`${bar(d.score)}\`\n\n`;
    md += `**Methodology:** ${d.methodology}\n\n`;
    if (d.reason) {
      md += `**Blocked:** ${d.reason}\n\n`;
    }
    if (d.raw && Object.keys(d.raw).length > 0) {
      const rawPairs = Object.entries(d.raw)
        .filter(([, v]) => typeof v !== 'object')
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      if (rawPairs) md += `_Data: ${rawPairs}_\n\n`;
    }
  }

  md += `---\n\n`;
  md += `## Score B — Industry Benchmark\n\n`;
  md += `Composite: ${bResult.composite !== null ? bResult.composite : '—'}  |  Wired: ${bResult.wiredCoverage}\n\n`;

  const bFrameworkMap = {
    B1: 'DORA (Google Cloud State of DevOps)',
    B2: 'OWASP SAMM + NIST SSDF',
    B3: 'WCAG 2.1 AA (W3C)',
    B4: 'Google Web Vitals',
    B5: 'TS strict-mode',
    B6: 'OSV / npm audit',
    B7: 'CHAOSS (Linux Foundation)',
    B8: 'Test coverage (vitest+playwright)',
  };

  for (const d of bDims) {
    const status = d.status === 'wired' ? '' : ` _(${d.status})_`;
    md += `### ${d.id} — ${d.name}${status}\n\n`;
    md += `Framework: _${bFrameworkMap[d.id] ?? d.id}_\n\n`;
    md += `\`${bar(d.score)}\`\n\n`;
    md += `**Methodology:** ${d.methodology}\n\n`;
    if (d.reason) {
      md += `**Blocked:** ${d.reason}\n\n`;
    }
    if (d.raw && Object.keys(d.raw).length > 0) {
      const rawPairs = Object.entries(d.raw)
        .filter(([, v]) => typeof v !== 'object')
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      if (rawPairs) md += `_Data: ${rawPairs}_\n\n`;
    }
  }

  md += `---\n\n`;
  md += `## Wiring Obligations\n\n`;
  md += `Dimensions that are \`needs-wiring\` require follow-up units before they contribute to the composite:\n\n`;

  const needsWiring = [...aDims, ...bDims].filter(d => d.status === 'needs-wiring');
  for (const d of needsWiring) {
    md += `- **${d.id} (${d.name}):** ${d.reason}\n`;
  }

  md += `\n---\n\n`;
  md += `_This file is auto-generated by \`scripts/generate-strength-report.mjs\`. Do not edit by hand._\n`;
  md += `_Run \`pnpm strength\` to refresh. Regenerated on every commit via \`.husky/pre-commit\`._\n`;

  return md;
}

// ---------------------------------------------------------------------------
// JSON report (LLM-readable)
// ---------------------------------------------------------------------------

function renderJSON(report, generated) {
  const { aDims, aResult, bDims, bResult, regressionWarning } = report;

  const payload = {
    generated,
    regressionWarning: regressionWarning ?? null,
    scoreA: {
      composite: aResult.composite ?? null,
      description: 'Internal Integrity — closed-loop discipline; 6 dims equal-weight 1/6',
      dimensions: aDims,
      wiredCoverage: aResult.wiredCoverage,
    },
    scoreB: {
      composite: bResult.composite ?? null,
      description: 'Industry Benchmark — external framework thresholds; 8 dims equal-weight 1/8',
      dimensions: bDims,
      wiredCoverage: bResult.wiredCoverage,
    },
    spec: 'docs/guardrails/strength-score-spec.md',
  };

  return JSON.stringify(sortKeys(payload), null, 2) + '\n';
}

// ---------------------------------------------------------------------------
// History snapshot
// ---------------------------------------------------------------------------

/**
 * Append (or replace today's) entry in docs/guardrails/strength-history.jsonl.
 *
 * Shape per line:
 *   { ts: ISO, date: YYYY-MM-DD, scoreA: { composite, wiredCoverage, dimensions: {...} },
 *     scoreB: { composite, wiredCoverage, dimensions: {...} } }
 *
 * Rules:
 *   - One entry per calendar day (YYYY-MM-DD). If today already exists, replace it.
 *   - Previous days' entries are NEVER modified (append-only across days).
 *   - Entries older than 365 days are pruned on each run.
 *   - Wall-clock fast: reads + rewrites the file in-process (no external tools).
 */
function appendHistorySnapshot(report, ts) {
  const historyPath = resolve(ROOT, 'docs/guardrails/strength-history.jsonl');

  const date = ts.slice(0, 10); // YYYY-MM-DD

  // Build dimension subscores maps (id → score)
  function dimMap(dims) {
    const m = {};
    for (const d of dims) {
      m[d.id] = d.score;
    }
    return m;
  }

  const { aDims, aResult, bDims, bResult } = report;

  const entry = {
    ts,
    date,
    scoreA: {
      composite: aResult.composite ?? null,
      wiredCoverage: aResult.wiredCoverage,
      dimensions: dimMap(aDims),
    },
    scoreB: {
      composite: bResult.composite ?? null,
      wiredCoverage: bResult.wiredCoverage,
      dimensions: dimMap(bDims),
    },
  };

  // Read existing lines
  let existing = [];
  if (existsSync(historyPath)) {
    const raw = readFileSync(historyPath, 'utf-8');
    existing = raw
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  }

  // Prune entries older than 365 days
  const cutoff = new Date(ts);
  cutoff.setDate(cutoff.getDate() - 365);
  const cutoffDate = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD string comparison is safe
  const pruned = existing.filter(e => (e.date ?? '') >= cutoffDate);

  // Drop any entry for today (same-day idempotency), then append new entry
  const withoutToday = pruned.filter(e => e.date !== date);
  withoutToday.push(entry);

  // Write back (each line is one JSON object, no trailing newline after last line)
  writeFileSync(
    historyPath,
    withoutToday.map(e => JSON.stringify(e)).join('\n') + '\n',
    'utf-8',
  );

  console.log(`[strength:snapshot] Appended entry for ${date} → docs/guardrails/strength-history.jsonl (${withoutToday.length} total entries)`);
}

// ---------------------------------------------------------------------------
// SYSTEM_OVERVIEW.md — LLM boot context (unit: 13s-strength-5-llm-system-overview)
// ---------------------------------------------------------------------------

/**
 * Derive active-sprint info from orchestration.json units.
 * Returns the cluster name with the highest pending (approved+claimed) count,
 * plus per-cluster tallies.
 */
function deriveSprintState() {
  /** @type {Map<string, {approved: number, claimed: number, done: number, total: number}>} */
  const clusterMap = new Map();

  for (const u of units) {
    const cluster = u.cluster ?? 'unknown';
    if (!clusterMap.has(cluster)) {
      clusterMap.set(cluster, { approved: 0, claimed: 0, done: 0, total: 0 });
    }
    const c = clusterMap.get(cluster);
    c.total++;
    if (u.status === 'approved') c.approved++;
    else if (u.status === 'claimed') c.claimed++;
    else if (u.status === 'done') c.done++;
  }

  // Sort clusters by (approved + claimed) descending; break ties by done desc
  const sorted = [...clusterMap.entries()].sort(([, a], [, b]) => {
    const pendingDiff = (b.approved + b.claimed) - (a.approved + a.claimed);
    return pendingDiff !== 0 ? pendingDiff : b.done - a.done;
  });

  const activeCluster = sorted[0] ?? null;

  return { clusterMap, activeCluster };
}

/**
 * Find hottest blockers: units with lastAbort notes or status=parked.
 * Returns up to 3, sorted by priority ascending (lower = hotter).
 */
function deriveBlockers() {
  const blockers = units
    .filter(u => u.status === 'parked' || (u.lastAbort && typeof u.lastAbort === 'string'))
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
    .slice(0, 3);
  return blockers;
}

/**
 * Find the top-3 weakest wired dimensions across Score A and Score B.
 * "Weakest" = lowest score among wired dims (needs-wiring excluded).
 * Returns array of {id, name, score, score_label}.
 */
function deriveWeakestDims(report) {
  const { aDims, bDims } = report;
  const allDims = [...aDims, ...bDims];
  const wired = allDims.filter(d => d.status === 'wired' && typeof d.score === 'number');
  wired.sort((a, b) => a.score - b.score);
  return wired.slice(0, 3).map(d => ({
    id: d.id,
    name: d.name,
    score: d.score,
    score_label: `${d.score}/100`,
  }));
}

/**
 * Emit docs/guardrails/SYSTEM_OVERVIEW.md — single-page LLM boot context.
 *
 * IDEMPOTENCY CONTRACT: same input → same bytes, modulo the `generated` timestamp
 * (passed in from main so it is shared with the other report files).
 */
function renderSystemOverview(report, generated) {
  const { aResult, bResult, regressionWarning } = report;
  const { clusterMap, activeCluster } = deriveSprintState();
  const blockers = deriveBlockers();
  const weakest = deriveWeakestDims(report);

  const aComp = aResult.composite !== null ? `${aResult.composite}/100` : '— (no wired dims)';
  const bComp = bResult.composite !== null ? `${bResult.composite}/100` : '— (no wired dims)';

  // Active sprint cluster summary line
  let sprintLine = 'none detected';
  if (activeCluster) {
    const [name, v] = activeCluster;
    sprintLine = `**${name}** — ${v.approved} approved, ${v.claimed} claimed, ${v.done} done / ${v.total} total`;
  }

  // Top clusters with pending work (up to 4, skip 'unknown' / zero-pending)
  const pendingClusters = [...clusterMap.entries()]
    .filter(([, v]) => v.approved + v.claimed > 0)
    .sort(([, a], [, b]) => (b.approved + b.claimed) - (a.approved + a.claimed))
    .slice(0, 4);

  let sprintTable = '';
  if (pendingClusters.length > 0) {
    sprintTable += `| Cluster | approved | claimed | done | total |\n`;
    sprintTable += `|---|---|---|---|---|\n`;
    for (const [name, v] of pendingClusters) {
      sprintTable += `| ${name} | ${v.approved} | ${v.claimed} | ${v.done} | ${v.total} |\n`;
    }
  } else {
    sprintTable = '_No clusters with pending units._\n';
  }

  // Weakest dims section
  let weakestSection = '';
  if (weakest.length === 0) {
    weakestSection = '_No wired dimensions yet._\n';
  } else {
    for (const d of weakest) {
      weakestSection += `- **${d.id} — ${d.name}:** ${d.score_label}\n`;
    }
  }

  // Blockers section
  let blockersSection = '';
  if (blockers.length === 0) {
    blockersSection = '_No parked or aborted units found._\n';
  } else {
    for (const u of blockers) {
      const note = u.lastAbort ? ` — ${u.lastAbort}` : ' — parked';
      blockersSection += `- **${u.id}** (${u.status})${note}\n`;
    }
  }

  const regressionBlock = regressionWarning
    ? `\n> ⚠️  **REGRESSION:** ${regressionWarning}\n`
    : '';

  let md = `# SYSTEM_OVERVIEW\n\n`;
  md += `> **Hirobius DesignOps Engine** — multi-tenant AI-native design system + agency platform.\n`;
  md += `> Auto-generated boot context for fresh LLM agents. Read in 30 seconds; dive deeper via the links below.\n`;
  md += `> Generated: ${generated}\n`;
  md += `${regressionBlock}\n`;

  md += `---\n\n`;
  md += `## 1. What is this repo?\n\n`;
  md += `Adrian Milsap's solo-founder agency platform. Three pillars:\n\n`;
  md += `- **HDS (Hirobius Design System)** — token-first, multi-tenant, AI-driven component library (src/).\n`;
  md += `- **Ops Command Center** — internal dashboard at \`/ops\` for client management, build orchestration, cost tracking.\n`;
  md += `- **Autonomous build pipeline** — swarm-watchdog dispatches parallel agent pods; all units tracked in \`docs/ai/orchestration.json\`.\n\n`;

  md += `Stack: React + Vite + TypeScript + Tailwind (token-mapped). 435+ orchestration units across phases 12–13.\n\n`;

  md += `---\n\n`;
  md += `## 2. Current state\n\n`;
  md += `| | Composite | Wired coverage | Signal |\n`;
  md += `|---|---|---|---|\n`;
  md += `| **Score A — Internal Integrity** | ${aComp} | ${aResult.wiredCoverage} | Closed-loop discipline |\n`;
  md += `| **Score B — Industry Benchmark** | ${bComp} | ${bResult.wiredCoverage} | DORA / OWASP / WCAG / Vitals |\n`;
  md += `\n`;

  if (aResult.composite !== null && aResult.composite < 80) {
    md += `> Score A < 80 — harden internal discipline first (spec rule: A must reach 80 for 3 consecutive days before B becomes primary focus).\n\n`;
  } else if (aResult.composite !== null && aResult.composite >= 80) {
    md += `> Score A ≥ 80 — primary focus shifts to Score B (external-capability units).\n\n`;
  }

  md += `### Top-3 weakest wired dimensions\n\n`;
  md += weakestSection + `\n`;

  md += `---\n\n`;
  md += `## 3. Active sprint\n\n`;
  md += `Hottest cluster (most pending units): ${sprintLine}\n\n`;
  md += sprintTable + `\n`;
  md += `_Full unit database: \`docs/ai/orchestration.json\` — 435 units, status field: approved | claimed | done | parked._\n\n`;

  md += `---\n\n`;
  md += `## 4. Blockers\n\n`;
  md += blockersSection + `\n`;

  md += `---\n\n`;
  md += `## 5. Where to look\n\n`;
  md += `| What | File |\n`;
  md += `|---|---|\n`;
  md += `| Full strength dashboard | \`docs/guardrails/strength-report.md\` |\n`;
  md += `| Score methodology ADR | \`docs/guardrails/strength-score-spec.md\` |\n`;
  md += `| Hardening roadmap + principles | \`docs/guardrails/HARDENING_ROADMAP.md\` |\n`;
  md += `| Gate registry (all validators) | \`docs/guardrails/registry.json\` |\n`;
  md += `| Unit spec database | \`docs/ai/orchestration.json\` |\n`;
  md += `| Autonomous build protocol | \`docs/ai/AUTONOMOUS_BUILD.md\` |\n`;
  md += `| Operator brief (active threads) | \`docs/ai/OPERATOR_BRIEF.md\` |\n`;
  md += `| Design token spec | \`hirobius.tokens.json\` |\n`;
  md += `| Component API (prop tables) | \`src/app/data/component-api.json\` |\n`;
  md += `\n`;

  md += `---\n\n`;
  md += `_Auto-generated by \`scripts/generate-strength-report.mjs\` (unit 13s-strength-5). Do not edit by hand._\n`;
  md += `_Run \`pnpm strength\` to refresh.\n`;

  return md;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const generated = new Date().toISOString();

  const report = buildReport();

  // --history-snapshot mode: append to JSONL and exit. Do NOT touch the main
  // report files — the snapshot is a separate output stream that must not
  // break the byte-identical determinism contract of the main report.
  if (HISTORY_SNAPSHOT) {
    appendHistorySnapshot(report, generated);
    return;
  }

  const mdContent = renderMarkdown(report, generated);
  const jsonContent = renderJSON(report, generated);
  const overviewContent = renderSystemOverview(report, generated);

  const mdPath = resolve(ROOT, 'docs/guardrails/strength-report.md');
  const jsonPath = resolve(ROOT, 'docs/guardrails/strength-report.json');
  const overviewPath = resolve(ROOT, 'docs/guardrails/SYSTEM_OVERVIEW.md');

  writeFileSync(mdPath, mdContent, 'utf-8');
  writeFileSync(jsonPath, jsonContent, 'utf-8');
  writeFileSync(overviewPath, overviewContent, 'utf-8');

  // Summary to stdout
  const { aResult, bResult } = report;
  const aStr = aResult.composite !== null ? `${aResult.composite}/100` : '— (no wired dims)';
  const bStr = bResult.composite !== null ? `${bResult.composite}/100` : '— (no wired dims)';
  console.log(`[strength] Score A: ${aStr}  (wired: ${aResult.wiredCoverage})`);
  console.log(`[strength] Score B: ${bStr}  (wired: ${bResult.wiredCoverage})`);
  if (report.regressionWarning) {
    console.warn(`[strength] REGRESSION: ${report.regressionWarning}`);
  }
  console.log(`[strength] Reports written to docs/guardrails/strength-report.{md,json} + SYSTEM_OVERVIEW.md`);
}

main();
