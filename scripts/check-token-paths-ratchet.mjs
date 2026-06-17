#!/usr/bin/env node
/**
 * check-token-paths-ratchet.mjs — merged gate (13z-6)
 *
 * Merged from: check-token-paths.mjs + check-token-paths-ratchet.mjs
 *
 * Default mode (pre-commit / scan):
 *   Scans src/** for string references to design-token paths
 *   ({primitive,semantic,component,role}.x.y.z) and asserts each resolves
 *   to a real entry in hirobius.tokens.json. Any NEW violation (not in the
 *   baseline) exits 1.
 *
 * Ratchet mode (ci-pr, --ratchet):
 *   Reads the current count of entries in .token-path-baseline.txt and
 *   enforces that the count strictly decreases over time. The last-known
 *   count is stored in docs/guardrails/baselines/check-token-paths-count.json.
 *
 * Flags:
 *   --ratchet           Run the ratchet count check instead of the path scan.
 *   --update-baseline   Write current violations to .token-path-baseline.txt.
 *   --full              Also print baselined violations in scan mode.
 *   --json              Emit { violations, summary, ok } JSON.
 *
 * Allowlist a line by appending a comment containing token-path-ok with a reason
 * or "@token-path-ok".
 *
 * Run: node scripts/check-token-paths-ratchet.mjs
 *      node scripts/check-token-paths-ratchet.mjs --ratchet
 *      node scripts/check-token-paths-ratchet.mjs --update-baseline
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, dirname, extname, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ─── Token-path scanning helpers ─────────────────────────────────────────────

function walkTokenTree(obj, prefix, out) {
  if (!obj || typeof obj !== 'object') return;
  if ('$value' in obj) {
    out.add(prefix.join('.'));
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('$')) continue;
    walkTokenTree(v, [...prefix, k], out);
  }
}

function loadValidPaths() {
  const tokens = JSON.parse(readFileSync(join(ROOT, 'hirobius.tokens.json'), 'utf8'));
  const paths = new Set();
  walkTokenTree(tokens, [], paths);
  const composites = [...paths];
  for (const p of composites) {
    const node = p.split('.').reduce((acc, seg) => acc?.[seg], tokens);
    const value = node?.$value;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const sub of Object.keys(value)) {
        paths.add(`${p}.${sub}`);
      }
    }
  }
  return paths;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function closestMatch(needle, haystack, maxDistance = 3) {
  let best = null;
  let bestDist = Infinity;
  for (const candidate of haystack) {
    const d = levenshtein(needle, candidate);
    if (d < bestDist) {
      bestDist = d;
      best = candidate;
    }
  }
  return bestDist <= maxDistance ? best : null;
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'coverage',
  'test-results', '.cache', '.turbo', '.pnpm-store',
]);
const SKIP_PATH_FRAGMENTS = [
  '.claude/worktrees',
  '.claude/HDS-V2-COMPLIANCE-AUDIT.md',
  'src/app/design-system/generated-token',
  'public/hds-manifest-agent.json',
  'tenants/',
  'docs/archive/',
  'docs/SYSTEMS-LOG.md',
  'docs/ai/AI_ORCHESTRATION.md',
  'docs/ai/OPERATOR_BRIEF_ARCHIVE.md',
  'docs/ai/orchestration.json',
  'docs/guardrails/full-strictness-inventory',
  'docs/guardrails/full-strictness-closure-plan.md',
  'TOKEN_MIGRATION.md',
  'docs/architecture/',
  'docs/legal/',
  'docs/operations/',
  'docs/ops/',
  'docs/superpowers/',
  'docs/knowledge/',
  'docs/LLM_STREAM_SCHEMA.md',
];
const ALLOWED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.css',
]);

function shouldSkipPath(rel) {
  return SKIP_PATH_FRAGMENTS.some((frag) => rel.includes(frag));
}

function walkFiles(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.husky') continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    const rel = relative(ROOT, full);
    if (shouldSkipPath(rel)) continue;
    if (entry.isDirectory()) {
      walkFiles(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!ALLOWED_EXTENSIONS.has(extname(entry.name))) continue;
    out.push(full);
  }
}

const PATH_PATTERN = /\b(?:primitive|semantic|component|role)\.[a-zA-Z][a-zA-Z0-9_-]*(?:\.[a-zA-Z][a-zA-Z0-9_-]*)+\b/g;
const ALLOWLIST_RE = /(?:token-path-ok:|@token-path-ok)/;

function scanFile(file, validPaths) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const violations = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (ALLOWLIST_RE.test(line)) continue;
    const matches = line.match(PATH_PATTERN);
    if (!matches) continue;
    const seen = new Set();
    for (const ref of matches) {
      if (seen.has(ref)) continue;
      seen.add(ref);
      if (validPaths.has(ref)) continue;
      let isPrefix = false;
      for (const p of validPaths) {
        if (p.startsWith(`${ref}.`)) { isPrefix = true; break; }
      }
      if (isPrefix) continue;
      violations.push({ file, line: i + 1, ref });
    }
  }
  return violations;
}

function loadBaseline() {
  try {
    const text = readFileSync(BASELINE_FILE, 'utf8');
    return new Set(
      text.split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'))
    );
  } catch {
    return new Set();
  }
}

function violationKey(v) {
  return `${relative(ROOT, v.file)}:${v.ref}`;
}

// ─── Ratchet helpers ──────────────────────────────────────────────────────────

const CANONICAL_FILE = join(ROOT, 'docs', 'guardrails', 'baselines', 'check-token-paths-count.json');

function readBaselineCount() {
  if (!existsSync(BASELINE_FILE)) return 0;
  const text = readFileSync(BASELINE_FILE, 'utf8');
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  return lines.length;
}

function readStored() {
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
  const record = {
    count,
    updatedAt: new Date().toISOString(),
    sha: getGitSha(),
  };
  writeFileSync(CANONICAL_FILE, JSON.stringify(record, null, 2) + '\n', 'utf8');
  return record;
}

// ─── Main ────────────────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));
const isRatchetMode = args.has('--ratchet');
const isUpdateBaseline = args.has('--update-baseline');
const isFullReport = args.has('--full');
const isFixtureMode = args.has('--fixture-mode') || process.env.HDS_FIXTURE_MODE === '1';
const fixtureFile = process.env.FIXTURE_FILE;
const jsonMode = hasJsonFlag(process.argv);
const BASELINE_FILE = join(ROOT, '.token-path-baseline.txt');

if (isRatchetMode) {
  // ─── Ratchet count mode (ci-pr) ──────────────────────────────────────────
  const current = readBaselineCount();
  const stored = readStored();

  if (stored === null) {
    writeStored(current);
    const msg = `check-token-paths-ratchet: bootstrapped stored count = ${current}`;
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
    const violation = {
      file: '.token-path-baseline.txt',
      line: null,
      rule: 'token-path-ratchet-regression',
      severity: 'error',
      message: `Token-path baseline grew: stored=${storedCount}, current=${current} (+${delta}). Fix dead token references and do NOT add new entries to .token-path-baseline.txt.`,
    };
    if (!jsonMode) {
      process.stderr.write(`\nX check-token-paths-ratchet FAILED\n`);
      process.stderr.write(`  Token-path baseline grew from ${storedCount} to ${current} (+${delta}).\n`);
      process.stderr.write(`  Fix the dead token references — do NOT add new entries to .token-path-baseline.txt.\n\n`);
    }
    emitResult({
      violations: [violation],
      summary: { current, stored: storedCount, delta },
      ok: false,
    }, jsonMode);
    process.exit(1);
  }

  writeStored(current);
  const msg = delta < 0
    ? `check-token-paths-ratchet: OK — burned down ${Math.abs(delta)} baseline entry(ies) (${storedCount} → ${current})`
    : `check-token-paths-ratchet: OK — no change (${current} baseline entries)`;
  if (!jsonMode) console.log(msg);
  emitResult({
    violations: [],
    summary: { current, stored: storedCount, delta },
    ok: true,
  }, jsonMode);
  process.exit(0);
}

// ─── Scan mode (default / pre-commit) ────────────────────────────────────────

const validPaths = loadValidPaths();
const files = [];
if (isFixtureMode && fixtureFile) {
  // In fixture mode, scope the scan to just the provided file.
  files.push(resolve(fixtureFile));
} else {
  walkFiles(join(ROOT, 'src'), files);
}

const allViolations = [];
for (const file of files) {
  allViolations.push(...scanFile(file, validPaths));
}

if (isUpdateBaseline) {
  const fs = await import('node:fs/promises');
  const lines = [
    '# .token-path-baseline.txt',
    '# Generated by `node scripts/check-token-paths-ratchet.mjs --update-baseline`.',
    '# Format: <relative-path>:<dead-token-path>',
    '# Each line below is a known unresolved token-path reference frozen at',
    '# baseline time. New violations not in this file fail the gate. Burn',
    '# down by fixing the reference and removing its line. See unit 12g.',
    '',
    ...[...new Set(allViolations.map(violationKey))].sort(),
  ];
  await fs.writeFile(BASELINE_FILE, lines.join('\n') + '\n');
  console.log(`✓ wrote ${lines.length - 7} baselined violation(s) to ${relative(ROOT, BASELINE_FILE)}`);
  process.exit(0);
}

const baseline = loadBaseline();
const newViolations = [];
const baselinedViolations = [];
for (const v of allViolations) {
  if (baseline.has(violationKey(v))) baselinedViolations.push(v);
  else newViolations.push(v);
}

if (jsonMode) {
  const canonical = [];
  for (const v of newViolations) {
    canonical.push({
      file: relative(ROOT, v.file),
      line: v.line,
      rule: 'token-path-unresolved',
      severity: 'error',
      message: `unresolved token path: ${v.ref}`,
      ref: v.ref,
      suggestion: closestMatch(v.ref, validPaths) || null,
    });
  }
  for (const v of baselinedViolations) {
    canonical.push({
      file: relative(ROOT, v.file),
      line: v.line,
      rule: 'token-path-unresolved',
      severity: 'baselined',
      message: `baselined unresolved token path: ${v.ref}`,
      ref: v.ref,
    });
  }
  emitResult(
    {
      violations: canonical,
      summary: {
        filesScanned: files.length,
        validPaths: validPaths.size,
        newViolations: newViolations.length,
        baselinedViolations: baselinedViolations.length,
      },
      ok: newViolations.length === 0,
    },
    true,
  );
  process.exit(newViolations.length === 0 ? 0 : 1);
}

if (newViolations.length === 0) {
  const status = baseline.size > 0
    ? ` (${baselinedViolations.length} baselined — burn down via unit 12g)`
    : '';
  console.log(`✓ check-token-paths-ratchet — ${files.length} files scanned, ${validPaths.size} valid paths, 0 new violations${status}`);
  if (isFullReport && baselinedViolations.length > 0) {
    console.log('\nBaselined violations:');
    for (const v of baselinedViolations) {
      console.log(`  ${relative(ROOT, v.file)}:${v.line}: ${v.ref}`);
    }
  }
  process.exit(0);
}

console.error(`✗ check-token-paths-ratchet — ${newViolations.length} NEW unresolved token-path reference(s):\n`);
for (const v of newViolations) {
  const rel = relative(ROOT, v.file);
  const suggestion = closestMatch(v.ref, validPaths);
  const hint = suggestion ? `  →  did you mean ${suggestion}?` : '';
  console.error(`  ${rel}:${v.line}: ${v.ref}${hint}`);
}
console.error(`
Fix the path, annotate the line with "token-path-ok:" if intentional, or
re-baseline (after manual review) with:
  node scripts/check-token-paths-ratchet.mjs --update-baseline

${baselinedViolations.length} existing baselined violation(s) not shown.`);
process.exit(1);
