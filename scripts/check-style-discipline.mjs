/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-style-discipline.mjs — merged gate (13z-6)
 *
 * Merged from: check-inline-styles.mjs + check-style-prop-values.mjs + check-css-values.mjs
 *
 * Runs all three style discipline checks by default. Sub-mode flags:
 *
 *   --inline-only        Only check: HTML elements with 6+ inline style props
 *   --style-props-only   Only check: suspicious style prop values (function/string refs)
 *   --css-values-only    Only check: raw color literals in hand-authored CSS files
 *
 * (Omit all flags to run all three checks in a single pass.)
 *
 * Checks:
 *
 * 1. inline-styles (from check-inline-styles.mjs):
 *    Catches plain HTML elements with 6+ inline style properties in style={{ ... }}.
 *    Threshold is 6 (vs DOM scanner's 4) to compensate for absence of HDS ancestor context.
 *    Suppression: add "// inline-ok: <reason>" on the same line as style={{ or the preceding line.
 *
 * 2. style-prop-values (from check-style-prop-values.mjs):
 *    Catches suspicious JSX style prop values: style={someFunction} or style={someString}.
 *    The intended happy path is style={{ ... }} or style={someStyleObject}.
 *
 * 3. css-values (from check-css-values.mjs):
 *    Catches raw color literals in hand-authored CSS files in src/styles/.
 *    All color values must be var(--*) references.
 *    Suppression: add "css-ok: <reason>" comment on the same or preceding line.
 *
 * Exit codes: 0 = clean, 1 = violations
 *
 * JSON output: node scripts/check-style-discipline.mjs --json
 * Emits { violations: Violation[], summary, ok } per gate-output.mjs contract.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, relative, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC  = join(ROOT, 'src');

const jsonMode = hasJsonFlag(process.argv);
const argv = new Set(process.argv.slice(2));
const INLINE_ONLY = argv.has('--inline-only');
const STYLE_PROPS_ONLY = argv.has('--style-props-only');
const CSS_VALUES_ONLY = argv.has('--css-values-only');
const RUN_ALL = !INLINE_ONLY && !STYLE_PROPS_ONLY && !CSS_VALUES_ONLY;

const isFixtureMode = argv.has('--fixture-mode') || process.env.HDS_FIXTURE_MODE === '1';
const fixtureFile = process.env.FIXTURE_FILE;

const SKIP_DIRS_BASE = new Set(['node_modules', '.git', 'dist']);
const allViolations = [];

// ─── Check 1: HTML elements with 6+ inline style properties ──────────────────

if (RUN_ALL || INLINE_ONLY) {
  const SKIP_FILES_INLINE = new Set([
    join(ROOT, 'src', 'app', 'design-system', 'generated-tokens.ts'),
  ]);

  const HTML_ELEMENTS = new Set([
    'div', 'span', 'nav', 'button', 'a', 'section', 'ul', 'li',
    'header', 'footer', 'main', 'aside', 'label', 'form', 'input',
    'textarea', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'tr', 'td', 'th',
  ]);

  function walkInline(dir, files = []) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (SKIP_DIRS_BASE.has(entry)) continue;
      const stat = statSync(full);
      if (stat.isDirectory()) { walkInline(full, files); continue; }
      if (extname(entry) !== '.tsx') continue;
      if (SKIP_FILES_INLINE.has(full)) continue;
      files.push(full);
    }
    return files;
  }

  function findElementTag(lines, styleLineIdx) {
    for (let i = styleLineIdx; i >= Math.max(0, styleLineIdx - 10); i--) {
      const m = lines[i].match(/<([a-zA-Z][a-zA-Z0-9]*)\b/);
      if (m) {
        const tag = m[1].toLowerCase();
        return HTML_ELEMENTS.has(tag) ? tag : null;
      }
    }
    return null;
  }

  const inlineFiles = isFixtureMode && fixtureFile ? [resolve(fixtureFile)] : walkInline(SRC);
  for (const file of inlineFiles) {
    const rel   = relative(ROOT, file).replace(/\\/g, '/');
    const lines = readFileSync(file, 'utf-8').split('\n');

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.includes('style={{')) { i++; continue; }

      const prevLine = i > 0 ? lines[i - 1] : '';
      if (line.includes('// inline-ok:') || prevLine.includes('// inline-ok:')) { i++; continue; }

      const tag = findElementTag(lines, i);
      if (!tag) { i++; continue; }

      const startLine = i + 1;
      let depth = 0;
      let propCount = 0;
      let j = i;

      const styleLineContent = line;
      for (const ch of styleLineContent) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }

      if (depth <= 0) {
        const inner = styleLineContent.replace(/.*style=\{\{/, '').replace(/\}\}.*/, '');
        const commaCount = (inner.match(/,/g) || []).length;
        propCount = commaCount > 0 ? commaCount + 1 : (inner.match(/[\w-]+\s*:/) ? 1 : 0);
      } else {
        j = i + 1;
        while (j < lines.length && depth > 0) {
          const cur = lines[j];
          for (const ch of cur) {
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
          }
          if (/^\s*[\w-]+\s*:/.test(cur)) propCount++;
          j++;
        }
      }

      if (propCount >= 6) {
        allViolations.push({
          file: rel,
          line: startLine,
          rule: 'inline-styles-overdense',
          severity: 'warn',
          message: `<${tag}> has ${propCount} inline style properties (threshold: 6)`,
          tag,
          propCount,
        });
      }

      i = depth <= 0 ? i + 1 : j;
    }
  }
}

// ─── Check 2: Suspicious style prop values ────────────────────────────────────

if (RUN_ALL || STYLE_PROPS_ONLY) {
  function walkStyleProps(dir, files = []) {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS_BASE.has(entry)) continue;
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) { walkStyleProps(full, files); continue; }
      if (!['.tsx', '.ts', '.jsx', '.js'].includes(extname(entry))) continue;
      files.push(full);
    }
    return files;
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function isFunctionIdentifier(source, identifier) {
    const name = escapeRegExp(identifier);
    const arrowPattern = new RegExp(
      String.raw`(?:const|let|var)\s+${name}(?:\s*:\s*[^=]+)?\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>`,
      'm',
    );
    const functionPattern = new RegExp(String.raw`function\s+${name}\s*\(`, 'm');
    return arrowPattern.test(source) || functionPattern.test(source);
  }

  function isStringLikeIdentifier(source, identifier) {
    const name = escapeRegExp(identifier);
    const stringPattern = new RegExp(
      String.raw`(?:const|let|var)\s+${name}(?:\s*:\s*[^=]+)?\s*=\s*(['"\`])`,
      'm',
    );
    return stringPattern.test(source);
  }

  function isObjectStyleIdentifier(source, identifier) {
    const name = escapeRegExp(identifier);
    const objectPattern = new RegExp(
      String.raw`(?:const|let|var)\s+${name}(?:\s*:\s*[^=]+)?\s*=\s*\{`,
      'm',
    );
    return objectPattern.test(source);
  }

  const stylePropsFiles = isFixtureMode && fixtureFile ? [resolve(fixtureFile)] : walkStyleProps(SRC);
  for (const file of stylePropsFiles) {
    const source = readFileSync(file, 'utf-8');
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const lines = source.split('\n');

    lines.forEach((line, index) => {
      const matches = [...line.matchAll(/style=\{([A-Za-z_$][\w$]*)\}/g)];
      for (const match of matches) {
        const identifier = match[1];

        if (isObjectStyleIdentifier(source, identifier)) continue;

        if (isFunctionIdentifier(source, identifier)) {
          allViolations.push({
            file: rel,
            line: index + 1,
            rule: 'style-prop-function',
            severity: 'warn',
            message: `style prop receives a function reference: ${identifier}`,
          });
          continue;
        }

        if (isStringLikeIdentifier(source, identifier)) {
          allViolations.push({
            file: rel,
            line: index + 1,
            rule: 'style-prop-string',
            severity: 'warn',
            message: `style prop receives a string-like value: ${identifier}`,
          });
        }
      }
    });
  }
}

// ─── Check 3: Raw color literals in hand-authored CSS ─────────────────────────

if ((RUN_ALL || CSS_VALUES_ONLY) && !isFixtureMode) {
  const STYLES_DIR = join(ROOT, 'src', 'styles');
  const EXCLUDED_CSS = new Set([
    join(STYLES_DIR, 'tokens.css'),
    join(STYLES_DIR, 'tokens.generated.css'),
    join(STYLES_DIR, 'theme.css'),
    join(STYLES_DIR, 'fonts.css'),
  ]);

  const HEX_RE    = /(?<![\w-])#[0-9a-fA-F]{3,8}\b/;
  const RGB_RE    = /\brgba?\s*\(/;
  const HSL_RE    = /\bhsla?\s*\(/;
  const NAMED_RE  = /(?<!-)\b(red|blue|green|white|black|gray|grey)\b(?!-)/i;
  const CSS_KW    = /\b(transparent|currentColor|inherit|initial|unset)\b/i;

  function stripBlockComments(line) {
    return line.replace(/\/\*[^*]*(?:\*(?!\/)[^*]*)*\*\//g, '');
  }

  let cssFiles = [];
  for (const entry of readdirSync(STYLES_DIR)) {
    const full = join(STYLES_DIR, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) continue;
    if (extname(entry) !== '.css') continue;
    if (EXCLUDED_CSS.has(full)) continue;
    cssFiles.push(full);
  }

  for (const file of cssFiles) {
    const rel   = relative(ROOT, file).replace(/\\/g, '/');
    const lines = readFileSync(file, 'utf-8').split('\n');

    for (let i = 0; i < lines.length; i++) {
      const raw  = lines[i];
      const line = stripBlockComments(raw);

      if (/^\s*(\/\/|\/\*|\*)/.test(raw.trim())) continue;

      const prevLine = i > 0 ? lines[i - 1] : '';
      if (line.includes('/* css-ok:') || raw.includes('/* css-ok:') || prevLine.includes('/* css-ok:')) continue;

      if (CSS_KW.test(line) && !HEX_RE.test(line) && !RGB_RE.test(line) && !HSL_RE.test(line)) continue;

      const patterns = [];
      if (HEX_RE.test(line))   patterns.push(line.match(HEX_RE)?.[0]);
      if (RGB_RE.test(line))   patterns.push(line.match(RGB_RE)?.[0]?.replace('(', '(...)'));
      if (HSL_RE.test(line))   patterns.push(line.match(HSL_RE)?.[0]?.replace('(', '(...)'));
      if (NAMED_RE.test(line)) {
        const m = line.match(NAMED_RE);
        if (m && !CSS_KW.test(m[0])) patterns.push(m[0]);
      }

      for (const pattern of patterns) {
        if (pattern) {
          allViolations.push({
            file: rel,
            line: i + 1,
            rule: 'css-raw-color',
            severity: 'warn',
            message: `raw color value in CSS: ${pattern}`,
            pattern,
          });
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
  const mode = INLINE_ONLY ? 'inline-styles' : STYLE_PROPS_ONLY ? 'style-props' : CSS_VALUES_ONLY ? 'css-values' : 'all checks';
  console.log(`✓ check-style-discipline (${mode}) — no violations`);
  process.exit(0);
}

// Group violations by rule
const byRule = new Map();
for (const v of allViolations) {
  if (!byRule.has(v.rule)) byRule.set(v.rule, []);
  byRule.get(v.rule).push(v);
}

for (const [rule, violations] of byRule) {
  console.error(`\n✗ check-style-discipline [${rule}] — ${violations.length} violation(s):`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    if (v.tag) console.error(`    Element: ${v.tag} (${v.propCount} inline style properties)`);
    if (v.message && !v.tag) console.error(`    ${v.message}`);
    if (v.pattern) console.error(`    Pattern: ${v.pattern}`);
  }
}

if (byRule.has('inline-styles-overdense')) {
  console.error('\n  Fix: extract to src/app/components/, add data-hds-component, or add "// inline-ok: <reason>"');
}
if (byRule.has('style-prop-function') || byRule.has('style-prop-string')) {
  console.error('\n  Fix: pass an object to style, or call the style factory before passing it.');
}
if (byRule.has('css-raw-color')) {
  console.error('\n  Fix: use var(--semantic-color-*) or var(--component-*), or add "css-ok: <reason>"');
}

process.exit(1);
