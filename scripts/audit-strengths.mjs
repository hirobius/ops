/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * audit-strengths.mjs
 *
 * Verifies that each documented differentiator in
 * docs/architecture/strengths-and-differentiators.md is still real.
 *
 * Usage:
 *   node scripts/audit-strengths.mjs          # human-readable output
 *   node scripts/audit-strengths.mjs --json   # JSON output
 *
 * Exit 0 = all checks passed. Exit 1 = one or more checks failed.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const jsonMode = process.argv.includes('--json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg) {
  if (!jsonMode) process.stdout.write(msg + '\n');
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Shallow-list files in a single directory (non-recursive).
 * Returns an array of filenames (not full paths).
 */
function listDir(dir) {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * Use `find` (via spawnSync) to count files matching a pattern in a directory.
 * Safer than recursive readdirSync on large trees with symlinks.
 */
function findCount(dir, namePattern, maxDepth = 20) {
  if (!fs.existsSync(dir)) return 0;
  const result = spawnSync('find', [dir, '-maxdepth', String(maxDepth), '-type', 'f', '-name', namePattern], {
    encoding: 'utf8',
    timeout: 15000,
  });
  if (result.error || result.status !== 0) return 0;
  return result.stdout.trim().split('\n').filter(Boolean).length;
}

/**
 * Use `find` to list files matching a pattern in a directory.
 */
function findFiles(dir, namePattern, maxDepth = 20) {
  if (!fs.existsSync(dir)) return [];
  const result = spawnSync('find', [dir, '-maxdepth', String(maxDepth), '-type', 'f', '-name', namePattern], {
    encoding: 'utf8',
    timeout: 15000,
  });
  if (result.error || result.status !== 0) return [];
  return result.stdout.trim().split('\n').filter(Boolean);
}

// ---------------------------------------------------------------------------
// Check 1: Validator count >= 40
//
// Walk scripts/ and count files matching:
//   *validator*.mjs | check-*.mjs | audit-*.mjs | validate-*.mjs | test-*.mjs
// ---------------------------------------------------------------------------
async function checkValidatorCount() {
  const scriptsDir = path.join(repoRoot, 'scripts');
  // Use multiple find patterns and deduplicate
  const patterns = ['*validator*.mjs', 'check-*.mjs', 'audit-*.mjs', 'validate-*.mjs', 'test-*.mjs'];
  const seen = new Set();
  for (const pat of patterns) {
    for (const f of findFiles(scriptsDir, pat, 2)) {
      seen.add(f);
    }
  }
  const count = seen.size;
  const passed = count >= 40;
  return {
    name: 'validator-count',
    passed,
    detail: `${count} validator/check/audit scripts found in scripts/ (threshold: >= 40)`,
  };
}

// ---------------------------------------------------------------------------
// Check 2: Fixture count >= 269
//
// Walk fixtures/, tests/**/__fixtures__/, tests/visual.spec.ts-snapshots/
// ---------------------------------------------------------------------------
async function checkFixtureCount() {
  let total = 0;

  // Walk fixtures/
  const fixturesDir = path.join(repoRoot, 'fixtures');
  total += findCount(fixturesDir, '*', 20);

  // Walk tests/**/__fixtures__/ — find files under any __fixtures__ subdir
  const testsDir = path.join(repoRoot, 'tests');
  if (fs.existsSync(testsDir)) {
    const result = spawnSync(
      'find',
      [testsDir, '-maxdepth', '10', '-type', 'f', '-path', '*/__fixtures__/*'],
      { encoding: 'utf8', timeout: 15000 }
    );
    if (!result.error && result.status === 0) {
      total += result.stdout.trim().split('\n').filter(Boolean).length;
    }
  }

  // Walk tests/visual.spec.ts-snapshots/
  const snapshotsDir = path.join(repoRoot, 'tests', 'visual.spec.ts-snapshots');
  total += findCount(snapshotsDir, '*', 5);

  const passed = total >= 269;
  return {
    name: 'fixture-count',
    passed,
    detail: `${total} fixture files found across fixtures/, tests/__fixtures__/, and visual snapshots (threshold: >= 269)`,
  };
}

// ---------------------------------------------------------------------------
// Check 3: No style-dictionary in deps
// ---------------------------------------------------------------------------
async function checkNoStyleDictionary() {
  const pkgPath = path.join(repoRoot, 'package.json');
  const pkg = readJsonSafe(pkgPath);
  if (!pkg) {
    return { name: 'no-style-dictionary', passed: false, detail: 'Could not read package.json' };
  }
  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.optionalDependencies,
    ...pkg.peerDependencies,
  };
  const found = Object.keys(allDeps).filter(
    (k) => k === 'style-dictionary' || k.startsWith('@tokens-studio/')
  );
  const passed = found.length === 0;
  return {
    name: 'no-style-dictionary',
    passed,
    detail: passed
      ? 'style-dictionary / @tokens-studio not present in any dependency field'
      : `Found forbidden deps: ${found.join(', ')}`,
  };
}

// ---------------------------------------------------------------------------
// Check 4: Manifest single-source-of-truth
//
// Confirms public/hds-manifest.json exists and has more entries than any
// duplicate registry. Checks known candidate locations (not a full repo walk).
// ---------------------------------------------------------------------------
async function checkManifestSingleSource() {
  const manifestPath = path.join(repoRoot, 'public', 'hds-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return {
      name: 'manifest-single-source',
      passed: false,
      detail: 'public/hds-manifest.json does not exist',
    };
  }

  const manifest = readJsonSafe(manifestPath);
  if (!manifest) {
    return {
      name: 'manifest-single-source',
      passed: false,
      detail: 'public/hds-manifest.json is not valid JSON',
    };
  }

  const canonicalCount = Object.keys(manifest.componentSpecs ?? {}).length;
  const threshold = Math.floor(canonicalCount * 0.5);
  const suspects = [];

  // Search known candidate directories (shallow) for JSON files with a
  // top-level components[] array of comparable size.
  // Deliberately NOT walking the entire repo tree (too slow / too many symlinks).
  const candidateDirs = [
    path.join(repoRoot, 'src'),
    path.join(repoRoot, 'manifest'),
    path.join(repoRoot, 'docs'),
    path.join(repoRoot, 'scripts'),
    path.join(repoRoot, 'pipeline'),
  ];

  for (const dir of candidateDirs) {
    const jsonFiles = findFiles(dir, '*.json', 6);
    for (const filePath of jsonFiles) {
      const rel = path.relative(repoRoot, filePath);
      // Skip snapshots and test fixtures
      if (rel.includes('snapshot') || rel.includes('.snapshots') || rel.includes('__fixtures__')) continue;
      try {
        const data = readJsonSafe(filePath);
        if (!data) continue;
        if (Array.isArray(data.components) && data.components.length >= threshold) {
          suspects.push({ file: rel, count: data.components.length });
        }
      } catch {
        // ignore
      }
    }
  }

  const passed = suspects.length === 0;
  const detail = passed
    ? `public/hds-manifest.json is the sole registry with ${canonicalCount} componentSpecs (checked src/, manifest/, docs/, scripts/, pipeline/)`
    : `public/hds-manifest.json has ${canonicalCount} componentSpecs — CANDIDATES with components[]: ${suspects
        .map((s) => `${s.file}(${s.count})`)
        .join(', ')}`;

  return { name: 'manifest-single-source', passed, detail };
}

// ---------------------------------------------------------------------------
// Check 5: ADR naming convention
//
// docs/architecture/ — no files matching *RFC* or *rfc*
// docs/adr/ — files must follow NNNN-kebab-case.md
// ---------------------------------------------------------------------------
async function checkAdrNaming() {
  const issues = [];

  // 5a: No RFC files in docs/architecture/
  const archDir = path.join(repoRoot, 'docs', 'architecture');
  if (fs.existsSync(archDir)) {
    const entries = listDir(archDir);
    for (const name of entries) {
      if (/RFC|rfc/.test(name)) {
        issues.push(`RFC file still present in docs/architecture/: ${name}`);
      }
    }
  }

  // 5b: Files in docs/adr/ must follow NNNN-kebab-case.md
  const adrDir = path.join(repoRoot, 'docs', 'adr');
  if (fs.existsSync(adrDir)) {
    const entries = listDir(adrDir);
    // Accept 3-or-4 digit zero-padded prefix (001- through 9999-) + kebab-case + .md
    const validPattern = /^\d{3,4}-[a-z0-9]+(-[a-z0-9]+)*\.md$/;
    for (const name of entries) {
      const fullPath = path.join(adrDir, name);
      try {
        if (!fs.statSync(fullPath).isFile()) continue;
      } catch { continue; }
      if (!validPattern.test(name)) {
        issues.push(`docs/adr/${name} does not follow NNNN-kebab-case.md convention`);
      }
    }
  } else {
    // docs/adr doesn't exist yet — note it but don't hard-fail (migration pending)
    issues.push('docs/adr/ directory does not exist (ADR migration pending 12n-api-rfc-process-formalization)');
  }

  // Hard fail only on: RFC files present, or malformed ADR names
  // Missing docs/adr dir is informational only
  const rfcIssues = issues.filter((i) => i.includes('RFC file'));
  const namingIssues = issues.filter((i) => i.includes('does not follow'));
  const passed = rfcIssues.length === 0 && namingIssues.length === 0;

  return {
    name: 'adr-naming-convention',
    passed,
    detail:
      issues.length === 0
        ? 'No RFC files in docs/architecture/; docs/adr/ follows NNNN-kebab-case.md convention'
        : issues.join('; '),
  };
}

// ---------------------------------------------------------------------------
// Check 6: Eco-model rule referenced in CLAUDE.md + memory
// ---------------------------------------------------------------------------
async function checkEcoModelRule() {
  const issues = [];

  // 6a: CLAUDE.md must contain the rule text
  const claudeMdPath = path.join(repoRoot, 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) {
    issues.push('CLAUDE.md not found');
  } else {
    const content = fs.readFileSync(claudeMdPath, 'utf8');
    if (!content.includes('always pick the cheapest model')) {
      issues.push('CLAUDE.md does not contain the eco-model rule ("always pick the cheapest model")');
    }
  }

  // 6b: Memory file must exist and reference the rule
  const homeDir = os.homedir();
  const projectsDir = path.join(homeDir, '.claude', 'projects');
  let memoryFound = false;
  let memoryHasRule = false;

  if (fs.existsSync(projectsDir)) {
    for (const pd of listDir(projectsDir)) {
      const memPath = path.join(projectsDir, pd, 'memory', 'feedback_eco_efficient_subagents.md');
      if (fs.existsSync(memPath)) {
        memoryFound = true;
        const content = fs.readFileSync(memPath, 'utf8');
        if (content.includes('cheapest model') || content.includes('haiku') || content.includes('eco')) {
          memoryHasRule = true;
        }
        break;
      }
    }
  }

  if (!memoryFound) {
    issues.push('feedback_eco_efficient_subagents.md not found in ~/.claude/projects/*/memory/');
  } else if (!memoryHasRule) {
    issues.push('feedback_eco_efficient_subagents.md found but does not reference the eco-model rule');
  }

  const passed = issues.length === 0;
  return {
    name: 'eco-model-rule-referenced',
    passed,
    detail: passed
      ? 'Eco-model rule referenced in CLAUDE.md and memory/feedback_eco_efficient_subagents.md'
      : issues.join('; '),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const checks = await Promise.all([
    checkValidatorCount(),
    checkFixtureCount(),
    checkNoStyleDictionary(),
    checkManifestSingleSource(),
    checkAdrNaming(),
    checkEcoModelRule(),
  ]);

  const failedChecks = checks.filter((c) => !c.passed);
  const passed = failedChecks.length === 0;

  if (jsonMode) {
    process.stdout.write(JSON.stringify({ checks, passed }, null, 2) + '\n');
  } else {
    for (const c of checks) {
      const marker = c.passed ? '[OK]  ' : '[FAIL]';
      log(`${marker} ${c.name}: ${c.detail}`);
    }
    log('');
    if (passed) {
      log('PASS');
    } else {
      log(`FAIL (${failedChecks.length}/${checks.length} checks failed)`);
    }
  }

  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  if (!jsonMode) {
    process.stderr.write(`[FAIL] audit-strengths: unexpected error: ${err.message}\n`);
  } else {
    process.stdout.write(JSON.stringify({ error: err.message, passed: false }) + '\n');
  }
  process.exit(1);
});
