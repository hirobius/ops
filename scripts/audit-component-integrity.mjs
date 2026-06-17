#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * audit-component-integrity.mjs — merged gate (13z-6)
 *
 * Merged from:
 *   audit-components.mjs          — token compliance audit for HDS components
 *   check-component-completeness.mjs — manifest completeness for LLM use
 *   check-component-docs.mjs      — documentation coverage gate
 *   check-public-api.mjs          — public API surface guard
 *
 * Default (no flags): runs all sub-checks in sequence.
 * Sub-mode flags (run one check in isolation):
 *   --tokens        Token compliance audit (replaces: tokens:audit / audit-components)
 *   --completeness  Manifest completeness (replaces: check-component-completeness)
 *   --docs          Documentation coverage (replaces: check-component-docs)
 *   --api           Public API surface guard (replaces: api:check / check-public-api)
 *
 * Additional flags (forwarded to the relevant sub-check):
 *   --soft          Pass through to --completeness check (warn mode)
 *   --verbose       Pass through to --completeness check
 *   --update-baseline  Update the API baseline (--api sub-check)
 *   --strict        Strict mode for --api check
 *   --json          Emit JSON for compatible sub-checks
 *
 * Exit codes: 0 = clean, 1 = violations, 2 = runtime error
 *
 * Run:
 *   node scripts/audit-component-integrity.mjs            (all checks)
 *   node scripts/audit-component-integrity.mjs --tokens   (token audit only)
 *   node scripts/audit-component-integrity.mjs --api --update-baseline
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
const argSet = new Set(args);

const MODE_TOKENS = argSet.has('--tokens');
const MODE_COMPLETENESS = argSet.has('--completeness');
const MODE_DOCS = argSet.has('--docs');
const MODE_API = argSet.has('--api');
const RUN_ALL = !MODE_TOKENS && !MODE_COMPLETENESS && !MODE_DOCS && !MODE_API;

const isFixtureMode = argSet.has('--fixture-mode') || process.env.HDS_FIXTURE_MODE === '1';
const fixtureFile = process.env.FIXTURE_FILE;

const SOFT = argSet.has('--soft');
const VERBOSE = argSet.has('--verbose');
const UPDATE_BASELINE = argSet.has('--update-baseline');
const STRICT_API = argSet.has('--strict');
const JSON_OUTPUT = argSet.has('--json');

let hadFailure = false;

// ─── Sub-check 1: Token compliance audit (audit-components logic) ─────────────

async function runTokensCheck() {
  const SCAN_DIR = join(ROOT, 'src/app/components');
  const SKIP_DIRS = new Set(['figma', 'lab']);
  const SKIP_FILES = new Set(['types.ts', 'hooks.ts', 'HdsWebGLTriangleLogo.tsx']);

  const CHECKS = [
    {
      name: 'Hardcoded hex color',
      test: (line) =>
        /(?::\s*|=\s*|,\s*|\(\s*)['"`]#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/.test(line) &&
        !line.includes('var(--') &&
        !line.includes('${'),
      fix: 'Use var(--semantic-color-*), var(--primitive-color-*), or hds.color.* token ref',
    },
    {
      name: 'Hardcoded rgba/rgb string literal',
      test: (line) => /['"`]rgba?\s*\(\s*\d/.test(line),
      fix: 'Use var(--semantic-color-*) CSS var or hds.color.surface.* token ref',
    },
    {
      name: 'Raw opacity fraction',
      test: (line) => /opacity:\s+0\.[1-9]/.test(line) && !/(hds\.|var\()/.test(line),
      fix: 'Use var(--primitive-opacity-*)',
    },
    {
      name: 'Hardcoded border-radius pixel value',
      test: (line) =>
        /borderRadius:\s*['"`]?\d+px/.test(line) && !/(hds\.borderRadius\.|var\(--)/.test(line),
      fix: 'Use hds.borderRadius.* or var(--primitive-radius-*)',
    },
    {
      name: 'Raw pixel number in dimension style prop',
      test: (line) => {
        if (!/\b(width|height|minWidth|maxWidth|minHeight|maxHeight|fontSize):\s+\d{2,}/.test(line))
          return false;
        if (/(?:width|height|minWidth|maxWidth|minHeight|maxHeight|fontSize):\s+['"`]/.test(line))
          return false;
        if (/(hds\.|var\(--)/.test(line)) return false;
        return true;
      },
      fix: 'Use hds.space.* for sizing, hds.typeStyles.* for font sizes',
    },
    {
      name: 'Template literal spacing shorthand',
      test: (line) => /\b(?:padding|margin):\s+`\$\{/.test(line),
      fix: 'Use paddingTop/Right/Bottom/Left individually',
    },
    {
      name: 'Raw transition duration',
      test: (line) =>
        /transition:/.test(line) &&
        /\b\d+\.?\d*(?:ms|s)\b/.test(line) &&
        !line.includes('hds.duration'),
      fix: 'Use hds.duration.fast or hds.duration.slow',
    },
  ];

  function isComment(trimmed) {
    return (
      trimmed.startsWith('//') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('/**')
    );
  }

  let totalViolations = 0;
  const report = [];

  function scanFile(filePath) {
    const rel = relative(ROOT, filePath).replace(/\\/g, '/');
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const hits = [];

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (isComment(trimmed)) continue;
      if (trimmed.includes('// audit-ok')) continue;
      if (trimmed.includes('/* audit-ok')) continue;

      for (const check of CHECKS) {
        if (check.test(raw)) {
          hits.push({ lineNum: i + 1, text: trimmed, check });
        }
      }
    }

    if (hits.length > 0) {
      report.push({ file: rel, hits });
      totalViolations += hits.length;
    }
  }

  function scanDir(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (!SKIP_DIRS.has(entry)) scanDir(full);
      } else if ((entry.endsWith('.tsx') || entry.endsWith('.ts')) && !SKIP_FILES.has(entry)) {
        scanFile(full);
      }
    }
  }

  if (isFixtureMode && fixtureFile) {
    scanFile(resolve(fixtureFile));
  } else {
    scanDir(SCAN_DIR);
  }

  if (totalViolations === 0) {
    console.log(
      '\n✓ audit-component-integrity [tokens] — 0 violations. Safe to mark [x] shipped.\n',
    );
    return true;
  }

  console.error(`\n✗ audit-component-integrity [tokens] — ${totalViolations} violation(s).\n`);
  for (const { file, hits } of report) {
    console.error(`  ${file}`);
    for (const { lineNum, text, check } of hits) {
      console.error(`    ${String(lineNum).padStart(4)}  [${check.name}]`);
      console.error(`          ${text}`);
      console.error(`          → ${check.fix}`);
    }
    console.error('');
  }
  return false;
}

// ─── Sub-check 2: Component completeness (check-component-completeness logic) ─

async function runCompletenessCheck() {
  const COMPONENT_DIR = join(ROOT, 'src/app/components');
  const MANIFEST_PATH = join(ROOT, 'public/hds-manifest.json');
  const COMPONENT_API_PATH = join(ROOT, 'src/app/data/component-api.json');

  function getTier(name) {
    const filePath = join(COMPONENT_DIR, `${name}.tsx`);
    if (!existsSync(filePath)) return null;
    const head = readFileSync(filePath, 'utf8').split('\n').slice(0, 30).join('\n');
    const match = head.match(/@tier\s+(primitive|pattern|template|utility)\b/i);
    return match ? match[1].toLowerCase() : null;
  }

  function isPublicApiTier(tier) {
    return tier === 'primitive' || tier === 'pattern';
  }

  function listHdsComponentFiles() {
    return readdirSync(COMPONENT_DIR)
      .filter((f) => /^Hds[A-Z][A-Za-z0-9]*\.tsx$/.test(f))
      .map((f) => f.replace(/\.tsx$/, ''));
  }

  function hasPropEntry(componentApi, name) {
    const entry = componentApi.components?.[name];
    if (!entry) return false;
    if (!Array.isArray(entry.props)) return false;
    return entry.props.length > 0;
  }

  const components = listHdsComponentFiles();
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const api = JSON.parse(readFileSync(COMPONENT_API_PATH, 'utf8'));
  const specs = manifest.componentSpecs || {};

  const failures = [];
  let exemptCount = 0;

  for (const name of components) {
    const tier = getTier(name);
    if (!isPublicApiTier(tier)) {
      exemptCount += 1;
      continue;
    }
    const spec = specs[name];
    if (!spec) {
      failures.push({ name, code: 'MISSING_MANIFEST', message: 'no componentSpecs entry' });
      continue;
    }
    const desc = spec.description || '';
    if (desc.length < 80) {
      failures.push({
        name,
        code: 'SHORT_DESCRIPTION',
        message: `description is ${desc.length} chars (< 80)`,
      });
    }
    if (!hasPropEntry(api, name)) {
      failures.push({
        name,
        code: 'NO_API_PROPS',
        message: 'no entry in component-api.json with at least one prop',
      });
    }
  }

  if (VERBOSE) {
    console.log(`Skipped ${exemptCount} non-public-API component(s) (tier=template/utility).`);
    console.log(`Walked ${components.length} src/app/components/Hds*.tsx files.`);
  }

  if (failures.length === 0) {
    console.log(
      '✓ audit-component-integrity [completeness] — all shipped components have rich manifest entries',
    );
    return true;
  }

  const label = SOFT ? '⚠ ' : '✗ ';
  for (const f of failures) {
    console[SOFT ? 'warn' : 'error'](`${label}${f.name}: [${f.code}] ${f.message}`);
  }
  console[SOFT ? 'warn' : 'error'](
    `\n${failures.length} completeness violation(s) across ${components.length} components.`,
  );

  if (SOFT) {
    console.warn('(--soft mode: exiting 0. Drop --soft once existing violations are fixed.)');
    return true;
  }
  return false;
}

// ─── Sub-check 3: Documentation coverage (check-component-docs logic) ─────────

async function runDocsCheck() {
  // Dynamic import for the TS-AST-heavy docs check logic
  // check-component-docs.mjs exports runComponentDocsCheck() and main()
  const docsMod = await import('./lib/check-component-docs.mjs');
  const result = docsMod.runComponentDocsCheck();

  if (result.ok) {
    if (result.missingSpecimens.length > 0) {
      console.error(
        `\n✗ audit-component-integrity [docs] — ${result.missingSpecimens.length} component(s) missing preview metadata.\n`,
      );
      for (const name of result.missingSpecimens) {
        console.error(`    - ${name}`);
      }
      return false;
    }
    console.log(
      `\n✓ audit-component-integrity [docs] — ${result.total}/${result.total} components documented.\n`,
    );
    return true;
  }

  console.error(
    `\n✗ audit-component-integrity [docs] — ${result.undocumented.length} component(s) undocumented.\n`,
  );
  console.error(`  ${result.covered}/${result.total} components have HDS doc page entries.\n`);
  for (const file of result.undocumented) {
    console.error(`    - ${file}`);
  }
  console.error(
    `  Fidelity grade: ${result.fidelity.grade} (${result.fidelity.complete}/${result.fidelity.total}, ${result.fidelity.percent}%)\n`,
  );
  return false;
}

// ─── Sub-check 4: Public API surface guard (check-public-api logic) ───────────

async function runApiCheck() {
  // Re-use check-public-api.mjs by running it as a subprocess rather than
  // duplicating the full TS compiler API code here. This avoids 400+ lines of
  // duplication while keeping the gate logic authoritative in one place.
  const { execFileSync } = await import('child_process');
  const scriptPath = join(ROOT, 'scripts', 'lib', 'check-public-api.mjs');

  if (!existsSync(scriptPath)) {
    // check-public-api.mjs still exists (not deleted in this merge cycle,
    // only de-registered from the gate registry). Warn if missing.
    console.warn('⚠ audit-component-integrity [api]: check-public-api.mjs not found, skipping.');
    return true;
  }

  const extraArgs = [];
  if (UPDATE_BASELINE) extraArgs.push('--update-baseline');
  if (STRICT_API) extraArgs.push('--strict');
  if (JSON_OUTPUT) extraArgs.push('--json');

  try {
    execFileSync(process.execPath, [scriptPath, ...extraArgs], {
      stdio: 'inherit',
      cwd: ROOT,
    });
    console.log('✓ audit-component-integrity [api] — public API surface matches baseline.');
    return true;
  } catch {
    return false;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  try {
    if (RUN_ALL || MODE_TOKENS) {
      const ok = await runTokensCheck();
      if (!ok) hadFailure = true;
    }

    if ((RUN_ALL || MODE_COMPLETENESS) && !isFixtureMode) {
      const ok = await runCompletenessCheck();
      if (!ok) hadFailure = true;
    }

    if ((RUN_ALL || MODE_DOCS) && !isFixtureMode) {
      const ok = await runDocsCheck();
      if (!ok) hadFailure = true;
    }

    if ((RUN_ALL || MODE_API) && !isFixtureMode) {
      const ok = await runApiCheck();
      if (!ok) hadFailure = true;
    }

    process.exit(hadFailure ? 1 : 0);
  } catch (err) {
    console.error('audit-component-integrity: fatal error:', err?.stack || err?.message || err);
    process.exit(2);
  }
}

main();
