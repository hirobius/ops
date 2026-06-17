#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-typography-discipline.mjs — merged gate (13z-6)
 *
 * Merged from: check-hardcoded-fonts.mjs + check-font-files.mjs + audit-typography-overrides.mjs
 *
 * Runs all three typography discipline checks by default. Individual checks
 * can be targeted with sub-mode flags:
 *
 *   --fonts-only       Only run: hardcoded font family check
 *   --font-files-only  Only run: @font-face url() file resolution check
 *   --overrides-only   Only run: fontWeight/textTransform override check
 *
 * (Omit all flags to run all three checks in a single pass.)
 *
 * Checks:
 *
 * 1. hardcoded-fonts (from check-hardcoded-fonts.mjs):
 *    Prevents raw font family strings in fontFamily style props.
 *    Escape hatch: add `// font-ok: <reason>` on the offending line.
 *
 * 2. font-files (from check-font-files.mjs):
 *    Verifies @font-face references in fonts.css resolve to real files.
 *    Catches font-file deletions/renames before they ship as broken requests.
 *
 * 3. typography-overrides (from audit-typography-overrides.mjs):
 *    Enforces single-weight + casing-via-eyebrow policy:
 *    - Satoshi 500 / Clash Display 500 / Geist Mono 400 are the only weights.
 *    - textTransform overrides must use hds.typeStyles.eyebrow composite.
 *    Escape hatch: add "// eyebrow-ok: <reason>" or "audit-ok: typography" comments.
 *
 * Exit codes: 0 = clean, 1 = violations, 2 = runtime error
 *
 * JSON output: node scripts/check-typography-discipline.mjs --json
 * Emits { violations: Violation[], summary, ok } per gate-output.mjs contract.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path, { join, dirname, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const jsonMode = hasJsonFlag(process.argv);
const argv = new Set(process.argv.slice(2));
const FONTS_ONLY = argv.has('--fonts-only');
const FONT_FILES_ONLY = argv.has('--font-files-only');
const OVERRIDES_ONLY = argv.has('--overrides-only');
const RUN_ALL = !FONTS_ONLY && !FONT_FILES_ONLY && !OVERRIDES_ONLY;

const isFixtureMode = argv.has('--fixture-mode') || process.env.HDS_FIXTURE_MODE === '1';
const fixtureFile = process.env.FIXTURE_FILE;

const allViolations = [];

// ─── Check 1: Hardcoded font families ────────────────────────────────────────

if (RUN_ALL || FONTS_ONLY) {
  const FORBIDDEN_PATTERNS = [
    // fontFamily prop with a quoted raw font name (in style objects)
    /fontFamily\s*[=:]\s*["'`](?:Geist Mono|geist-mono|Clash Display|clash-display|Clash Grotesk|clash-grotesk|monospace|sans-serif|serif|system-ui)["'`]/i,
    // font-family CSS property with raw mono family names (in CSS-in-JS)
    /"font-family"\s*:\s*["'`](?:Geist Mono|Clash Display|Clash Grotesk)["'`]/i,
  ];

  const SKIP_FILES_FONTS = new Set([
    'src/app/context/FontContext.tsx',
    'src/app/design-system/tokens.ts',
    'src/app/design-system/generated-tokens.ts',
  ]);

  const SKIP_DIRS_FONTS = new Set([
    'node_modules',
    '.git',
    '.claude',
    'dist',
    'scripts',
    'src/styles',
    'test-results',
    'fixtures',
    'tools', // standalone tools not governed by HDS token system
  ]);

  function walkFonts(dir, files = []) {
    for (const entry of readdirSync(dir)) {
      if (entry.includes('\\')) continue; // skip Windows-path temp dirs (e.g. Lighthouse CI on WSL)
      const full = join(dir, entry);
      const rel = relative(ROOT, full);
      if (SKIP_DIRS_FONTS.has(entry) || SKIP_DIRS_FONTS.has(rel)) continue;
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walkFonts(full, files);
        continue;
      }
      const ext = extname(entry);
      if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) continue;
      if (SKIP_FILES_FONTS.has(rel)) continue;
      files.push(full);
    }
    return files;
  }

  const fontFiles = isFixtureMode && fixtureFile ? [path.resolve(fixtureFile)] : walkFonts(ROOT);
  for (const file of fontFiles) {
    const rel = relative(ROOT, file);
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    const fileExempt = lines.some((line) => /font-ok:/.test(line));
    if (fileExempt) continue;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*(\/\/|\/\*|\*|#)/.test(line)) continue;
      if (/font-ok:/.test(line)) continue;

      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(line)) {
          allViolations.push({
            file: rel,
            line: i + 1,
            rule: 'hardcoded-font',
            severity: 'error',
            message: 'raw font family string in fontFamily / font-family',
            sample: line.trim(),
          });
          break;
        }
      }
    }
  }
}

// ─── Check 2: @font-face file resolution ─────────────────────────────────────

if ((RUN_ALL || FONT_FILES_ONLY) && !isFixtureMode) {
  const FONTS_CSS_PATH = join(ROOT, 'src/styles/fonts.css');
  const PUBLIC_DIR = join(ROOT, 'public');

  if (!existsSync(FONTS_CSS_PATH)) {
    if (jsonMode) {
      emitResult(
        {
          violations: [
            {
              file: 'src/styles/fonts.css',
              line: null,
              rule: 'font-file-missing-css',
              severity: 'error',
              message: 'src/styles/fonts.css is missing',
            },
          ],
          summary: { total: 1 },
          ok: false,
        },
        true,
      );
      process.exit(1);
    }
    console.error('\n✗ Typography discipline — src/styles/fonts.css is missing.\n');
    process.exit(1);
  }

  const cssContent = readFileSync(FONTS_CSS_PATH, 'utf8');
  const urlPattern = /src:\s*url\(["']?([^)"']+)["']?\)/g;
  const matches = [...cssContent.matchAll(urlPattern)];
  const checkedPaths = new Set();

  for (const match of matches) {
    const urlPath = match[1];
    const resolvedPath = join(PUBLIC_DIR, urlPath.startsWith('/') ? urlPath.slice(1) : urlPath);
    if (checkedPaths.has(resolvedPath)) continue;
    checkedPaths.add(resolvedPath);

    if (!existsSync(resolvedPath)) {
      allViolations.push({
        file: 'src/styles/fonts.css',
        line: null,
        rule: 'font-file-missing',
        severity: 'error',
        message: `@font-face references missing file: ${urlPath}`,
        resolvedPath,
      });
    }
  }
}

// ─── Check 3: fontWeight / textTransform overrides ───────────────────────────

if (RUN_ALL || OVERRIDES_ONLY) {
  const SRC = path.join(ROOT, 'src');

  const ALLOWLIST_PREFIXES_OVERRIDES = ['src/app/pages/sketches/'];
  const ALLOWLIST_FILES_OVERRIDES = new Set([
    'src/app/pages/hds/TypographyPage.tsx',
    'src/app/pages/hds/TypographyTestPage.tsx',
    'src/app/pages/ops/agentic-os/AgenticOSPage.tsx',
    'src/app/pages/ops/agentic-os/StatusBanner.tsx',
    'src/app/pages/ops/agentic-os/KpiCards.tsx',
    'src/app/pages/ops/agentic-os/SkillsBar.tsx',
    'src/app/pages/ops/agentic-os/LanesGrid.tsx',
    'src/app/pages/ops/agentic-os/StrengthFooter.tsx',
  ]);
  const SKIP_BASENAME_PATTERNS = [/^generated-/, /\.generated\./, /\.test\./, /\.spec\./];
  const SKIP_EXACT_FILES = new Set([
    'src/styles/tokens.css',
    'src/styles/tokens.generated.css',
    'src/styles/tenants.css',
    'src/styles/fonts.css',
  ]);

  const FORBIDDEN_WEIGHT_TERMS = [
    '500',
    '600',
    '700',
    '800',
    '900',
    '100',
    '200',
    '300',
    '400',
    'medium',
    'semibold',
    'bold',
    'extrabold',
    'black',
    'thin',
    'light',
    'regular',
  ];

  function relPath(abs) {
    return path.relative(ROOT, abs).replaceAll(path.sep, '/');
  }

  function isAllowedOverrides(rel) {
    if (ALLOWLIST_FILES_OVERRIDES.has(rel)) return true;
    for (const prefix of ALLOWLIST_PREFIXES_OVERRIDES) if (rel.startsWith(prefix)) return true;
    if (SKIP_EXACT_FILES.has(rel)) return true;
    const base = path.basename(rel);
    for (const re of SKIP_BASENAME_PATTERNS) if (re.test(base)) return true;
    if (rel.includes('/__tests__/')) return true;
    return false;
  }

  function* walkSrc(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        yield* walkSrc(full);
      } else if (/\.(ts|tsx|css)$/.test(entry.name)) {
        yield full;
      }
    }
  }

  const FONTWEIGHT_LINE = /fontWeight\s*:\s*([^,}\n)]+)/g;
  const FONT_WEIGHT_CSS = /(?<![-\w])font-weight\s*:\s*([^;}\n]+)/g;
  const TEXT_TRANSFORM_LINE = /textTransform\s*:\s*['"`]([^'"`]+)['"`]/g;
  const TEXT_TRANSFORM_CSS = /(?<![-\w])text-transform\s*:\s*([^;}\n]+)/g;

  function isForbiddenWeight(rhs) {
    const v = rhs
      .toLowerCase()
      .trim()
      .replace(/['"`,;]/g, '');
    if (!v) return false;
    if (v === 'inherit' || v === 'normal' || v === 'unset' || v === 'initial') return false;
    if (/^var\(--/.test(v)) return false;
    for (const term of FORBIDDEN_WEIGHT_TERMS) {
      const re = new RegExp(`(?<![\\w-])${term}(?![\\w-])`, 'i');
      if (re.test(v)) return true;
    }
    return false;
  }

  function isForbiddenTransform(rhs) {
    const v = rhs
      .toLowerCase()
      .trim()
      .replace(/['"`,;]/g, '');
    return v === 'uppercase' || v === 'lowercase' || v === 'capitalize';
  }

  const overrideFiles =
    isFixtureMode && fixtureFile ? [path.resolve(fixtureFile)] : [...walkSrc(SRC)];
  for (const abs of overrideFiles) {
    const rel = relPath(abs);
    if (!isFixtureMode && isAllowedOverrides(rel)) continue;
    const content = readFileSync(abs, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*(\/\/|\*)/.test(line)) continue;
      // Escape hatch: lines annotated with // eyebrow-ok: or // audit-ok: are intentional.
      const hasEscapeHatch = /\/\/ (eyebrow-ok|font-ok|audit-ok):/.test(line);
      if (hasEscapeHatch) continue;

      for (const re of [FONTWEIGHT_LINE, FONT_WEIGHT_CSS]) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(line))) {
          if (isForbiddenWeight(m[1])) {
            allViolations.push({
              file: rel,
              line: i + 1,
              rule: 'typography-override-fontWeight',
              severity: 'error',
              message: `fontWeight override: ${m[1].trim()}`,
              sample: line.trim(),
            });
          }
        }
      }
      for (const re of [TEXT_TRANSFORM_LINE, TEXT_TRANSFORM_CSS]) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(line))) {
          if (isForbiddenTransform(m[1])) {
            allViolations.push({
              file: rel,
              line: i + 1,
              rule: 'typography-override-textTransform',
              severity: 'error',
              message: `textTransform override: ${m[1].trim()}`,
              sample: line.trim(),
            });
          }
        }
      }
    }
  }
}

// ─── Output ──────────────────────────────────────────────────────────────────

if (jsonMode) {
  emitResult(
    {
      violations: allViolations,
      summary: { total: allViolations.length },
      ok: allViolations.length === 0,
    },
    true,
  );
  process.exit(allViolations.length === 0 ? 0 : 1);
}

if (allViolations.length === 0) {
  const mode = FONTS_ONLY
    ? 'font-families'
    : FONT_FILES_ONLY
      ? 'font-files'
      : OVERRIDES_ONLY
        ? 'overrides'
        : 'all checks';
  console.log(`✓ check-typography-discipline (${mode}) — no violations`);
  process.exit(0);
}

// Group violations by rule for clear reporting
const byRule = new Map();
for (const v of allViolations) {
  if (!byRule.has(v.rule)) byRule.set(v.rule, []);
  byRule.get(v.rule).push(v);
}

for (const [rule, violations] of byRule) {
  console.error(`\n✗ check-typography-discipline [${rule}] — ${violations.length} violation(s):`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    if (v.sample) console.error(`    ${v.sample}`);
    if (v.message) console.error(`    → ${v.message}`);
  }
}

if (byRule.has('hardcoded-font')) {
  console.error(
    '\n  Fix: Use hds.monoFamily or hds.typeStyles.mono. Add "// font-ok: <reason>" to annotate intentional exceptions.',
  );
}
if (
  byRule.has('typography-override-fontWeight') ||
  byRule.has('typography-override-textTransform')
) {
  console.error('\n  Fix fontWeight: drop the override; rely on the typography composite weight.');
  console.error(
    '  Fix textTransform: spread hds.typeStyles.eyebrow (bakes uppercase + caps tracking).',
  );
  console.error('  If irreplaceable, append `// eyebrow-ok: <reason>` to the line.');
}

process.exit(1);
