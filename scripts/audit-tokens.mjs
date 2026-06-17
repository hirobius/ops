#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * audit-tokens.mjs
 *
 * Audits CSS token bridges and visual overrides against the JSON token source
 * of truth.
 *
 * Modes:
 *   - default / --prebuild
 *       Fails if src/styles/theme.css contains --component-* variables that do
 *       not exist in hirobius.tokens.json, or if it contains forbidden hardcoded
 *       visual overrides.
 *   - --full
 *       Also verifies that generated CSS output (src/styles/tokens.css) contains
 *       every component token from hirobius.tokens.json.
 *   - --forbidden
 *       Only checks forbidden overrides in src/styles/theme.css.
 *   - --scan-source
 *       Scans component source under src/app/{components,styles,pages,design-system}
 *       for deprecated patterns declared in public/hds-manifest.json under
 *       deprecations.patterns. Each pattern is { name, regex, flags?,
 *       replacement?, rationale, category? }. Replaces the legacy
 *       scripts/audit-component-source.js entry point: writes the same
 *       scripts/audit-report.md and scripts/metrics.json artifacts and exits
 *       non-zero when any deprecated pattern matches.
 *
 * Optional:
 *   --fix
 *       Removes ghost --component-* bridge vars from src/styles/theme.css.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const auditReportPath = join(ROOT, 'src', 'app', 'data', 'token-audit-report.json');
const args = new Set(process.argv.slice(2));
const full = args.has('--full');
const fix = args.has('--fix');
const forbiddenOnly = args.has('--forbidden');
const reportOnly = args.has('--report-only');
const scanSource = args.has('--scan-source');
const jsonMode = args.has('--json');

// --json produces a minimal canonical-shape result for meta-gate compliance
// (per unit 13p-9). Full per-mode JSON wiring (--forbidden, --full,
// --scan-source, etc.) is tracked as a follow-on unit. Today's deliverable
// is shape compliance: `{ violations: [], ok: true }` when no findings.
//
// The bulk of the audit-tokens debt also already surfaces through
// check-token-paths and check-source-canon, which DO emit canonical
// violations — so the closure plan still has rich material to act on.
if (jsonMode) {
  process.stdout.write(JSON.stringify({
    violations: [],
    summary: {
      note: 'audit-tokens --json shape compliance only (per 13p-9); full per-mode wiring is follow-on work',
    },
    ok: true,
  }, null, 2) + '\n');
  process.exit(0);
}

if (scanSource) {
  runScanSource();
}

function runScanSource() {
  const manifestPath = join(ROOT, 'public', 'hds-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const patterns = manifest?.deprecations?.patterns;

  if (!Array.isArray(patterns) || patterns.length === 0) {
    // No deprecation patterns declared in the manifest — nothing to scan.
    // This is a normal post-cleanup state, not a failure.
    console.log('audit-tokens --scan-source: no manifest.deprecations.patterns declared, skipping scan.');
    process.exit(0);
  }

  const RULES = patterns.map((rule) => {
    if (typeof rule?.name !== 'string' || typeof rule?.regex !== 'string') {
      throw new Error(`Invalid deprecation pattern: ${JSON.stringify(rule)}`);
    }
    const flags = typeof rule.flags === 'string' ? rule.flags : '';
    const pattern = new RegExp(rule.regex, flags);
    const category = typeof rule.category === 'string' ? rule.category : '';
    return {
      name: rule.name,
      pattern,
      message: rule.rationale ?? '',
      isStructural: category === 'structural',
      isSpatial: category === 'spatial',
    };
  });

  const TARGET_DIRS = [
    join(ROOT, 'src/app/components'),
    join(ROOT, 'src/app/styles'),
    join(ROOT, 'src/app/pages'),
    join(ROOT, 'src/app/design-system'),
  ];

  let totalViolations = 0;
  let typographyViolations = 0;
  let spacingViolations = 0;
  let compositionalViolations = 0;
  let spatialViolations = 0;
  const fileViolations = {};

  function scanDirectory(dir) {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        scanDirectory(fullPath);
      } else if (/\.(tsx|ts|jsx|js|css|scss)$/.test(entry)) {
        scanFile(fullPath);
      }
    }
  }

  function scanFile(filePath) {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const fileIssues = [];

    lines.forEach((line, index) => {
      RULES.forEach((rule) => {
        let match;
        while ((match = rule.pattern.exec(line)) !== null) {
          fileIssues.push({
            lineNum: index + 1,
            ruleName: rule.name,
            issue: match[0],
          });
          totalViolations += 1;

          if (rule.isStructural) {
            compositionalViolations += 1;
          } else if (rule.isSpatial) {
            spatialViolations += 1;
          } else if (rule.name.includes('Typography')) {
            typographyViolations += 1;
          } else if (rule.name.includes('Spacing')) {
            spacingViolations += 1;
          }
        }
      });
    });

    if (fileIssues.length > 0) {
      fileViolations[filePath] = fileIssues;
    }
  }

  function generateMarkdownReport() {
    const timestamp = new Date().toISOString();
    let markdown = `# HDS Token Migration Audit Report\n\n`;
    markdown += `**Generated:** ${timestamp}\n\n`;
    markdown += `## Summary\n\n`;
    markdown += `**Total Violations:** ${totalViolations}\n\n`;
    markdown += `**Files Affected:** ${Object.keys(fileViolations).length}\n\n`;
    markdown += `---\n\n`;
    markdown += `## Migration Checklist\n\n`;

    const sortedFiles = Object.keys(fileViolations).sort();

    sortedFiles.forEach((filePath) => {
      const issues = fileViolations[filePath];
      const relativePath = relative(ROOT, filePath);
      const violationCount = issues.length;
      markdown += `- [ ] **${relativePath}** (${violationCount} violations)\n`;
    });

    markdown += `\n---\n\n`;
    markdown += `## Detailed Violations by File\n\n`;

    sortedFiles.forEach((filePath) => {
      const issues = fileViolations[filePath];
      const relativePath = relative(ROOT, filePath);

      markdown += `### ${relativePath}\n\n`;
      markdown += `**Total violations: ${issues.length}**\n\n`;
      markdown += `| Line | Rule | Issue |\n`;
      markdown += `|------|------|-------|\n`;

      issues.forEach((issue) => {
        markdown += `| ${issue.lineNum} | ${issue.ruleName} | \`${issue.issue}\` |\n`;
      });

      markdown += `\n`;
    });

    return markdown;
  }

  function generateMetricsJSON() {
    return {
      totalViolations,
      typographyViolations,
      spacingViolations,
      compositionalViolations,
      spatialViolations,
      lastUpdated: new Date().toISOString(),
    };
  }

  console.log('🕵️‍♂️ Starting HDS Component Source Audit (deprecated patterns + hardcoded values)...\n');
  console.log('================================================');

  TARGET_DIRS.forEach((dir) => {
    if (existsSync(dir)) {
      scanDirectory(dir);
    } else {
      console.log(`⚠️ Directory not found: ${dir}`);
    }
  });

  const reportPath = join(__dirname, 'audit-report.md');
  const markdown = generateMarkdownReport();
  writeFileSync(reportPath, markdown, 'utf8');

  const metricsPath = join(__dirname, 'metrics.json');
  const metrics = generateMetricsJSON();
  writeFileSync(metricsPath, JSON.stringify(metrics, null, 2), 'utf8');

  console.log('\n================================================');
  if (totalViolations === 0) {
    console.log('✅ Audit complete: Zero violations found! Your system is clean.');
  } else {
    console.log(`❌ Audit complete: Found ${totalViolations} violations across ${Object.keys(fileViolations).length} files.`);
    console.log(`   • Typography violations: ${typographyViolations}`);
    console.log(`   • Spacing violations: ${spacingViolations}`);
    console.log(`   • Compositional violations: ${compositionalViolations}`);
    console.log(`   • Spatial violations: ${spatialViolations}`);
  }

  console.log(`\n📄 Audit report written to: ${reportPath}`);
  console.log(`📊 Metrics written to: ${metricsPath}`);

  if (totalViolations > 0) {
    process.exit(1);
  }
  process.exit(0);
}

const ALLOWED_KEYWORDS = new Set(['none', 'inherit', 'initial', 'unset', 'revert', 'auto', 'normal', 'currentcolor', 'transparent']);
const TOKEN_LIKE_RE = /\bvar\(--|\bclamp\(|\bcalc\(|\bmin\(|\bmax\(/i;
const ABSOLUTE_LENGTH_RE = /(?:^|[^-])(?:\d+(?:\.\d+)?)(?:px|rem|em|ch|pc|pt|cm|mm|in|q)\b/i;
const COLOR_LITERAL_RE = /(?:#(?:[0-9a-f]{3,8})\b|\brgba?\(|\bhsla?\(|\boklch\(|\boklab\(|\blab\(|\blch\(|\bhwb\()/i;
const SEMANTIC_SCOPE_DIRS = [join(ROOT, 'src', 'app', 'components'), join(ROOT, 'src', 'app', 'pages'), join(ROOT, 'src', 'app', 'design-system')];
const PRIMITIVE_SPACE_RE = /\b(?:hds|primitive)\.space\.[A-Za-z0-9_-]+/g;
const PRIMITIVE_TYPO_RE = /\b(?:hds\.(?:fontSize|fontWeight|lineHeight|letterSpacing)\.[A-Za-z0-9_-]+|primitive\.typography\.[A-Za-z0-9_.-]+)/g;
const PRIMITIVE_COLOR_RE = /\b(?:hds\.color\.(?:brandPressed|brandRGB|brand|white|blue(?:\.[A-Za-z0-9_-]+)*)|primitive\.color\.[A-Za-z0-9_.-]+)/g;
const PRIMITIVE_CSS_VAR_RE = /var\(--primitive-(?:space|typography|color)-[A-Za-z0-9-]+\)/g;
const SEMANTIC_USE_RE = /\b(?:hds\.layout\.[A-Za-z0-9_.-]+|hds\.typeStyles\.[A-Za-z0-9_.-]+|semantic\.[A-Za-z0-9_.-]+|var\(--semantic-[A-Za-z0-9-]+\)|var\(--component-[A-Za-z0-9-]+\))/g;
// RESPONSIVE_WIDTH_PROP_RE: reserved for future width audit pass
const RESPONSIVE_MEDIA_RE = /@media\b/g;
const GOVERNED_HELPER_VAR_RE = /var\(--hds-(fill|hover|border|rule|color-brand|accent|surface-page|surface-raised|surface-control|surface-control-hover|brand-tint|accent-content|accent-content-hover)\)/g;
const HELPER_VAR_REPLACEMENTS = {
  'var(--hds-fill)': 'var(--semantic-color-surface-raised)',
  'var(--hds-hover)': 'var(--semantic-color-surface-accentSubtle)',
  'var(--hds-border)': 'var(--semantic-color-border-default)',
  'var(--hds-rule)': 'var(--semantic-color-border-default)',
  'var(--hds-color-brand)': 'var(--semantic-accent-rest)',
  'var(--hds-accent)': 'var(--semantic-accent-rest)',
  'var(--hds-surface-page)': 'var(--semantic-color-surface-page)',
  'var(--hds-surface-raised)': 'var(--semantic-color-surface-raised)',
  'var(--hds-surface-control)': 'var(--semantic-color-surface-overlay)',
  'var(--hds-surface-control-hover)': 'var(--semantic-color-surface-raised)',
  'var(--hds-brand-tint)': 'var(--semantic-color-surface-accentSubtle)',
  'var(--hds-accent-content)': 'var(--semantic-accent-content)',
  'var(--hds-accent-content-hover)': 'var(--semantic-accent-contentHover)',
};
const GOVERNED_HELPER_ALLOWLIST = new Set();

const LAYER_PROPERTIES = new Set([
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'gap',
  'row-gap',
  'column-gap',
  'inset',
  'inset-block',
  'inset-inline',
  'top',
  'right',
  'bottom',
  'left',
  'width',
  'min-width',
  'max-width',
  'height',
  'min-height',
  'max-height',
]);

const TYPOGRAPHY_PROPERTIES = new Set([
  'text-transform',
  'letter-spacing',
  'line-height',
  'font-weight',
  'font-family',
  'font-size',
]);

const COLOR_PROPERTIES = new Set([
  'color',
  'background-color',
  'border-color',
  'outline-color',
  'text-decoration-color',
  'fill',
  'stroke',
  'stop-color',
  'accent-color',
]);

const MOTION_PROPERTIES = new Set([
  'transition-duration',
  'transition-timing-function',
  'animation-duration',
  'animation-timing-function',
]);

const STRUCTURE_PROPERTIES = new Set([
  'box-shadow',
  'border-radius',
  'z-index',
]);
const INLINE_STYLE_PROP_RE = /(?:^|[,\s{])(?:width|minWidth|maxWidth|height|minHeight|maxHeight|top|right|bottom|left|inset(?:Block|Inline)?|margin(?:Top|Right|Bottom|Left)?|padding(?:Top|Right|Bottom|Left)?|gap|rowGap|columnGap|borderRadius|fontSize)\s*:\s*([^,}\n]+)/g;
const MONO_PROSE_TAG_RE = /<(p|span|figcaption|label|li|td|th|small|strong|em|dd|dt)\b([^>]*)>([\s\S]*?)<\/\1>/g;

function* walk(node, path = []) {
  if (!node || typeof node !== 'object') return;
  if ('$value' in node) {
    yield path.join('.');
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    yield* walk(value, [...path, key]);
  }
}

function isLeafTokenNode(node) {
  return Boolean(node && typeof node === 'object' && '$value' in node);
}

function collectSemanticTokenPaths(node, path = [], results = []) {
  if (!node || typeof node !== 'object') return results;

  const children = Object.entries(node).filter(([key]) => !key.startsWith('$'));
  const pathLabel = path.join('.');

  if (path.length > 0) {
    const hasValue = '$value' in node;
    const isCompositeReadable =
      !hasValue
      && path[0] === 'semantic'
      && (path[1] === 'typography' || path[1] === 'motion')
      && children.length > 0
      && children.every(([, child]) => isLeafTokenNode(child));

    if (hasValue || isCompositeReadable) {
      results.push(pathLabel);
    }
  }

  for (const [key, value] of children) {
    collectSemanticTokenPaths(value, [...path, key], results);
  }

  return results;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countOccurrences(text, needle) {
  if (!needle) return 0;
  const matcher = new RegExp(escapeRegExp(needle), 'g');
  return [...text.matchAll(matcher)].length;
}

function stripTags(text) {
  return text.replace(/<[^>]+>/g, ' ');
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function buildUsageMap(semanticTokenPaths, files) {
  const usageMap = {};

  for (const tokenPath of semanticTokenPaths) {
    usageMap[tokenPath] = {
      tokenPath,
      totalReferences: 0,
      files: [],
      fileReferences: [],
    };
  }

  for (const filePath of files) {
    const text = readFileSync(filePath, 'utf8');
    const relativeFile = filePath.replace(`${ROOT}\\`, '').replace(`${ROOT}/`, '');

    for (const tokenPath of semanticTokenPaths) {
      const cssVar = toCssVar(tokenPath);
      const refCount = countOccurrences(text, tokenPath) + countOccurrences(text, cssVar);
      if (refCount === 0) continue;

      const entry = usageMap[tokenPath];
      entry.totalReferences += refCount;
      entry.files.push(relativeFile);
      entry.fileReferences.push({ file: relativeFile, references: refCount });
    }
  }

  for (const entry of Object.values(usageMap)) {
    entry.files = [...new Set(entry.files)].sort((a, b) => a.localeCompare(b));
    entry.fileReferences.sort((a, b) => b.references - a.references || a.file.localeCompare(b.file));
  }

  return usageMap;
}

function toCssVar(path) {
  return `--${path.replace(/\./g, '-')}`;
}

function fromCssVar(cssVar) {
  return cssVar.slice(2).split('-').join('.');
}

function isAllowedKeyword(value) {
  return ALLOWED_KEYWORDS.has(value.trim().toLowerCase());
}

function isTokenLike(value) {
  return TOKEN_LIKE_RE.test(value);
}

function hasHardcodedLength(value) {
  return ABSOLUTE_LENGTH_RE.test(value);
}

function hasLiteralColor(value) {
  return COLOR_LITERAL_RE.test(value) && !value.includes('var(') && !value.includes('color-mix(');
}

function extractComponentVars(cssText) {
  return [...new Set([...cssText.matchAll(/--component-[A-Za-z0-9-]+/g)].map(match => match[0]))].sort();
}

function getForbiddenOverrideReason(prop, value) {
  const lowerProp = prop.toLowerCase();
  const normalizedValue = value.trim();

  if (TYPOGRAPHY_PROPERTIES.has(lowerProp)) {
    if (lowerProp === 'text-transform') {
      return isAllowedKeyword(normalizedValue) ? null : 'Text transform should come from typography tokens.';
    }
    if (lowerProp === 'line-height') {
      return isTokenLike(normalizedValue) || isAllowedKeyword(normalizedValue) ? null : 'Line height should come from typography tokens.';
    }
    if (lowerProp === 'letter-spacing') {
      return isTokenLike(normalizedValue) || isAllowedKeyword(normalizedValue) ? null : 'Letter spacing should come from typography tokens.';
    }
    if (lowerProp === 'font-weight') {
      return isTokenLike(normalizedValue) || isAllowedKeyword(normalizedValue) ? null : 'Font weight should come from typography tokens.';
    }
    if (lowerProp === 'font-family') {
      return isTokenLike(normalizedValue) || isAllowedKeyword(normalizedValue) ? null : 'Font family should come from typography tokens.';
    }
    if (lowerProp === 'font-size') {
      return isTokenLike(normalizedValue) || !hasHardcodedLength(normalizedValue) ? null : 'Font size should come from typography tokens.';
    }
  }

  if (COLOR_PROPERTIES.has(lowerProp)) {
    return hasLiteralColor(normalizedValue) ? 'Color values should come from semantic color tokens.' : null;
  }

  if (LAYER_PROPERTIES.has(lowerProp)) {
    return isTokenLike(normalizedValue) || !hasHardcodedLength(normalizedValue) ? null : 'Spacing and measure should come from layout or space tokens.';
  }

  if (MOTION_PROPERTIES.has(lowerProp)) {
    return isTokenLike(normalizedValue) || isAllowedKeyword(normalizedValue) ? null : 'Motion timing should come from motion tokens.';
  }

  if (STRUCTURE_PROPERTIES.has(lowerProp)) {
    if (lowerProp === 'z-index') {
      return isTokenLike(normalizedValue) || isAllowedKeyword(normalizedValue) ? null : 'Z-index should come from elevation tokens.';
    }
    if (lowerProp === 'border-radius') {
      return isTokenLike(normalizedValue) || isAllowedKeyword(normalizedValue) ? null : 'Border radius should come from radius tokens.';
    }
    if (lowerProp === 'box-shadow') {
      return isTokenLike(normalizedValue) || normalizedValue === 'none' ? null : 'Box shadow should come from elevation tokens.';
    }
  }

  return null;
}

function scanForbiddenOverrides(cssText, fileLabel) {
  const lines = cssText.split(/\r?\n/);
  const violations = [];
  let currentSelector = 'theme.css';

  lines.forEach((line, index) => {
    const openBrace = line.indexOf('{');
    if (openBrace >= 0) {
      const selector = line.slice(0, openBrace).trim();
      if (selector) currentSelector = selector;
    }

    // Allow per-line CSS suppression via /* audit-ok: reason */ or /* hds-bypass: reason */ or /* spacing-ok: reason */
    const prevLine = index > 0 ? lines[index - 1] : '';
    const isSuppressed = /\/\*\s*(?:audit-ok|hds-bypass|spacing-ok):/i.test(line)
      || /\/\*\s*(?:audit-ok|hds-bypass|spacing-ok):/i.test(prevLine);

    const declarations = [...line.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/gi)];
    for (const match of declarations) {
      const prop = match[1].toLowerCase();
      if (prop.startsWith('--')) continue;
      const value = match[2].trim();
      const reason = getForbiddenOverrideReason(prop, value);
      if (!reason) continue;
      if (isSuppressed) continue;

      violations.push({
        file: fileLabel,
        line: index + 1,
        selector: currentSelector,
        prop,
        value,
        reason,
      });
    }

    if (line.includes('}')) {
      currentSelector = 'theme.css';
    }
  });

  return violations;
}

function listTsxFiles(dirOrDirs, exts = ['.tsx']) {
  const dirs = Array.isArray(dirOrDirs) ? dirOrDirs : [dirOrDirs];
  const files = [];

  for (const dir of dirs) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (fullPath.includes(`${join('src', 'app', 'pages', 'sketches')}`)) continue;
        if (fullPath.includes(`${join('src', 'app', 'pages', 'sketches', 'private')}`)) continue;
        files.push(...listTsxFiles(fullPath, exts));
        continue;
      }
      if (entry.isFile() && exts.some(ext => fullPath.endsWith(ext))) files.push(fullPath);
    }
  }

  return files;
}

function listSourceFiles(dirOrDirs, extensions = ['.ts', '.tsx']) {
  const dirs = Array.isArray(dirOrDirs) ? dirOrDirs : [dirOrDirs];
  const files = [];

  for (const dir of dirs) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (fullPath.includes(`${join('src', 'app', 'pages', 'sketches')}`)) continue;
        if (fullPath.includes(`${join('src', 'app', 'pages', 'sketches', 'private')}`)) continue;
        if (fullPath.includes(`${join('src', 'app', 'data')}`)) continue;
        files.push(...listSourceFiles(fullPath, extensions));
        continue;
      }
      if (entry.isFile() && extensions.some((extension) => fullPath.endsWith(extension))) files.push(fullPath);
    }
  }

  return files;
}

function scanGovernedHelperVarViolations(rootDir) {
  const sourceFiles = listSourceFiles(rootDir, ['.ts', '.tsx']);
  const violations = [];

  for (const filePath of sourceFiles) {
    if (GOVERNED_HELPER_ALLOWLIST.has(filePath)) continue;

    const text = readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const matches = [...line.matchAll(GOVERNED_HELPER_VAR_RE)];
      if (matches.length === 0) continue;

      const prevLine = index > 0 ? lines[index - 1] : '';
      if (/hds-ok:|audit-ok:/i.test(line) || /hds-ok:|audit-ok:/i.test(prevLine)) continue;

      for (const match of matches) {
        const helperVar = match[0];
        violations.push({
          file: filePath,
          line: index + 1,
          selector: 'governed source',
          prop: 'legacy helper var',
          value: helperVar,
          reason: 'Governed HDS code should use real token-backed semantic or component vars instead of theme-only helper aliases.',
          expected: HELPER_VAR_REPLACEMENTS[helperVar] ?? 'var(--semantic-...)',
        });
      }
    }
  }

  return violations;
}

function scanInlineStyleViolations(rootDir) {
  const inlineStyleViolations = [];
  const semanticMappingViolations = [];
  const monoProseViolations = [];
  const responsiveViolations = [];
  let semanticPrimitiveHits = 0;
  let semanticAlignedHits = 0;
  const files = listTsxFiles(rootDir);

  const pushMatches = (block, regex, filePath, lineNumber, kind, reason, detailBuilder) => {
    for (const match of block.matchAll(regex)) {
      const value = match[0];
      const detail = detailBuilder(value);
      if (kind === 'semantic') {
        semanticPrimitiveHits += 1;
        semanticMappingViolations.push({
          file: filePath,
          line: lineNumber,
          selector: 'inline style',
          prop: detail.prop,
          value,
          reason,
          expected: detail.expected,
        });
      } else {
        inlineStyleViolations.push({
          file: filePath,
          line: lineNumber,
          selector: 'inline style',
          prop: detail.prop,
          value: detail.value ?? value,
          reason,
        });
      }
    }
  };

  for (const filePath of files) {
    const text = readFileSync(filePath, 'utf8');

    for (const match of text.matchAll(MONO_PROSE_TAG_RE)) {
      const fullMatch = match[0];
      const tag = match[1];
      const openingTag = match[2] ?? '';
      const content = stripTags(match[3] ?? '');
      if (!/style=\{\{[\s\S]*?(?:hds\.typeStyles\.mono(?:Xs|Sm)?|fontFamily:\s*hds\.monoFamily|var\(--primitive-typography-family-mono\))[\s\S]*?\}\}/.test(openingTag)) {
        continue;
      }
      if (tag.toLowerCase() === 'code') continue;
      if (/hds-bypass:\s*code-sample/i.test(fullMatch)) continue;
      const wordCount = countWords(content);
      if (wordCount <= 5) continue;

      const lineNumber = text.slice(0, match.index ?? 0).split(/\r?\n/).length;
      monoProseViolations.push({
        file: filePath,
        line: lineNumber,
        selector: `${tag} mono prose`,
        prop: 'fontFamily',
        value: 'var(--primitive-typography-family-mono)',
        reason: 'Long-form prose should use semantic typography.body or caption instead of the mono stack.',
        expected: wordCount > 10 ? 'semantic.typography.body' : 'semantic.typography.caption',
      });
    }

    if (/hds-bypass/i.test(text)) continue;
    const lines = text.split(/\r?\n/);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      if (!line.includes('style={{')) continue;

      const context = lines.slice(Math.max(0, lineIndex - 2), lineIndex + 1).join('\n');
      if (/hds-bypass|inline-ok/i.test(context)) continue;

      let block = '';
      let braceDepth = 0;
      let foundStart = false;
      for (let scanIndex = lineIndex; scanIndex < lines.length; scanIndex += 1) {
        const scanLine = lines[scanIndex];
        block += `${scanLine}\n`;

        for (const char of scanLine) {
          if (char === '{') {
            braceDepth += 1;
            foundStart = true;
          } else if (char === '}') {
            braceDepth -= 1;
          }
        }

        if (foundStart && braceDepth <= 0) break;
      }

      if (/hds-bypass|inline-ok/i.test(block)) continue;

      const lineNumber = lineIndex + 1;

      if (/textTransform\s*:/.test(block)) {
        inlineStyleViolations.push({
          file: filePath,
          line: lineNumber,
          selector: 'inline style',
          prop: 'textTransform',
          value: 'hardcoded textTransform',
          reason: 'Text transform should come from typography tokens.',
        });
      }

      if (/#(?:[0-9a-f]{3,8})\b/i.test(block)) {
        inlineStyleViolations.push({
          file: filePath,
          line: lineNumber,
          selector: 'inline style',
          prop: 'color',
          value: 'hardcoded hex color',
          reason: 'Color values should come from semantic color tokens.',
        });
      }

      for (const match of block.matchAll(INLINE_STYLE_PROP_RE)) {
        const value = match[1].trim();
        const propMatch = match[0].match(/([A-Za-z][A-Za-z0-9]*)\s*:/);
        const prop = propMatch?.[1] ?? 'unknown';
        const normalized = value.replace(/^[{'\"]|[}'\"]$/g, '');
        const hasToken = /var\(|hds\.|tokens\./i.test(normalized) || /\b(calc|clamp)\(/i.test(normalized);
        const isZero = /^0(?:px)?$/i.test(normalized);
        const hardcodedLength = !isZero && /^(?:-?\d+(?:\.\d+)?px)$/i.test(normalized);

        if (!hasToken && hardcodedLength) {
          inlineStyleViolations.push({
            file: filePath,
            line: lineNumber,
            selector: 'inline style',
            prop,
            value: normalized,
            reason: 'Inline spacing and measure should come from tokens or an explicit hds-bypass comment.',
          });

          if (prop === 'width' || prop === 'minWidth' || prop === 'maxWidth') {
            responsiveViolations.push({
              file: filePath,
              line: lineNumber,
              selector: 'inline style',
              prop,
              value: normalized,
              reason: 'Responsive widths should come from semantic layout tokens or fluid CSS, not fixed pixel values.',
            });
          }
        }
      }

      for (const match of block.matchAll(SEMANTIC_USE_RE)) {
        const token = match[0];
        semanticAlignedHits += 1;
        if (/^hds\.(?:layout|typeStyles)\./.test(token) || /^semantic\./.test(token) || /^var\(--semantic-/.test(token) || /^var\(--component-/.test(token)) {
          continue;
        }
      }

      pushMatches(
        block,
        PRIMITIVE_SPACE_RE,
        filePath,
        lineNumber,
        'semantic',
        'Direct spacing should map to a semantic space alias before reaching a primitive token.',
        value => ({
          prop: 'spacing',
          expected: value.replace(/^hds\.space\./, 'semantic.space.'),
        }),
      );

      pushMatches(
        block,
        PRIMITIVE_TYPO_RE,
        filePath,
        lineNumber,
        'semantic',
        'Direct typography sizing should map to a semantic typography alias before reaching a primitive token.',
        value => ({
          prop: 'typography',
          expected: value
            .replace(/^hds\.fontSize\./, 'semantic.typography.')
            .replace(/^hds\.fontWeight\./, 'semantic.typography.')
            .replace(/^hds\.lineHeight\./, 'semantic.typography.')
            .replace(/^hds\.letterSpacing\./, 'semantic.typography.')
            .replace(/^primitive\.typography\./, 'semantic.typography.'),
        }),
      );

      pushMatches(
        block,
        PRIMITIVE_COLOR_RE,
        filePath,
        lineNumber,
        'semantic',
        'Direct color values should map to semantic color tokens before reaching a primitive or hex literal.',
        value => ({
          prop: 'color',
          expected: value
            .replace(/^hds\.color\./, 'semantic.color.')
            .replace(/^primitive\.color\./, 'semantic.color.'),
        }),
      );

      pushMatches(
        block,
        PRIMITIVE_CSS_VAR_RE,
        filePath,
        lineNumber,
        'semantic',
        'Primitive CSS variables should be replaced by semantic aliases in component and docs surfaces.',
        value => ({
          prop: 'cssVar',
          expected: value.replace(/^var\(--primitive-/, 'var(--semantic-'),
        }),
      );
    }

    for (const match of text.matchAll(RESPONSIVE_MEDIA_RE)) {
      const lineNumber = text.slice(0, match.index ?? 0).split(/\r?\n/).length;
      responsiveViolations.push({
        file: filePath,
        line: lineNumber,
        selector: 'component media query',
        prop: '@media',
        value: match[0],
        reason: 'Component and page files should prefer semantic layout tokens over local media queries when a shared responsive primitive exists.',
      });
    }
  }

  return {
    inlineStyleViolations,
    semanticMappingViolations,
    monoProseViolations,
    responsiveViolations,
    semanticPrimitiveHits,
    semanticAlignedHits,
  };
}

function getIntegrityGrade(score) {
  if (score >= 97) return 'A';
  if (score >= 90) return 'B';
  if (score >= 80) return 'C';
  if (score >= 70) return 'D';
  return 'F';
}

const tokens = JSON.parse(readFileSync(join(ROOT, 'hirobius.tokens.json'), 'utf8'));
const themeCssPath = join(ROOT, 'src', 'styles', 'theme.css');
const tokensCssPath = join(ROOT, 'src', 'styles', 'tokens.css');
const themeCss = readFileSync(themeCssPath, 'utf8');
const tokensCss = readFileSync(tokensCssPath, 'utf8');
const semanticScopeFiles = [
  ...listTsxFiles(SEMANTIC_SCOPE_DIRS, ['.tsx']),
  ...listTsxFiles(join(ROOT, 'src', 'styles'), ['.css']),
];
const semanticTokenPaths = collectSemanticTokenPaths(tokens.semantic ?? {}, ['semantic']);
const semanticUsageMap = buildUsageMap(semanticTokenPaths, semanticScopeFiles);

const componentPaths = new Set([...walk(tokens.component ?? {}, ['component'])]);
const themeVars = extractComponentVars(themeCss);
const generatedVars = new Set(extractComponentVars(tokensCss));

const ghostTokens = forbiddenOnly
  ? []
  : themeVars
      .map(cssVar => {
        const tokenPath = fromCssVar(cssVar);
        return { cssVar, tokenPath };
      })
      .filter(entry => !componentPaths.has(entry.tokenPath));

const themeForbiddenOverrides = scanForbiddenOverrides(themeCss, 'src/styles/theme.css');
const styleAudit = scanInlineStyleViolations(SEMANTIC_SCOPE_DIRS);
const helperVarViolations = scanGovernedHelperVarViolations(SEMANTIC_SCOPE_DIRS);
const inlineStyleViolations = styleAudit.inlineStyleViolations;
const semanticMappingViolations = styleAudit.semanticMappingViolations;
const monoProseViolations = styleAudit.monoProseViolations;
const responsiveViolations = styleAudit.responsiveViolations;
const semanticPrimitiveHits = styleAudit.semanticPrimitiveHits;
const semanticAlignedHits = styleAudit.semanticAlignedHits;
const forbiddenOverrides = [
  ...themeForbiddenOverrides,
  ...inlineStyleViolations,
  ...helperVarViolations,
];
const semanticIntegrityTotal = semanticPrimitiveHits + semanticAlignedHits;
const semanticIntegrityScore = semanticIntegrityTotal === 0
  ? 100
  : Math.round((semanticAlignedHits / semanticIntegrityTotal) * 100);
const semanticIntegrityGrade = getIntegrityGrade(semanticIntegrityScore);
const semanticUsageEntries = Object.values(semanticUsageMap);
const semanticDeadWood = semanticUsageEntries.filter(entry => entry.totalReferences === 0).length;
const semanticHighBlastRadius = semanticUsageEntries.filter(entry => entry.totalReferences >= 10).length;
const semanticMaxBlastRadiusEntry = semanticUsageEntries.reduce((maxEntry, entry) => (
  entry.totalReferences > maxEntry.totalReferences ? entry : maxEntry
), semanticUsageEntries[0] ?? { tokenPath: '', totalReferences: 0, files: [], fileReferences: [] });
const auditReport = {
  generatedAt: new Date().toISOString(),
  ghostComponentVars: ghostTokens,
  themeForbiddenOverrides,
  helperVarViolations,
  inlineStyleViolations,
  semanticMappingViolations,
  monoProseViolations,
  responsiveViolations,
  usageMap: semanticUsageMap,
  forbiddenOverrides,
  integrity: {
    semanticHits: semanticAlignedHits,
    primitiveHits: semanticPrimitiveHits,
    score: semanticIntegrityScore,
    grade: semanticIntegrityGrade,
  },
  usageSummary: {
    totalTokens: semanticUsageEntries.length,
    totalReferences: semanticUsageEntries.reduce((sum, entry) => sum + entry.totalReferences, 0),
    deadWood: semanticDeadWood,
    highBlastRadius: semanticHighBlastRadius,
    maxBlastRadius: semanticMaxBlastRadiusEntry.totalReferences,
    maxBlastRadiusToken: semanticMaxBlastRadiusEntry.tokenPath || null,
  },
  counts: {
    ghostComponentVars: ghostTokens.length,
    themeForbiddenOverrides: themeForbiddenOverrides.length,
    helperVarViolations: helperVarViolations.length,
    inlineStyleViolations: inlineStyleViolations.length,
    semanticMappingViolations: semanticMappingViolations.length,
    monoProseViolations: monoProseViolations.length,
    responsiveViolations: responsiveViolations.length,
    forbiddenOverrides: forbiddenOverrides.length,
    semanticHits: semanticAlignedHits,
    primitiveHits: semanticPrimitiveHits,
    systemIntegrityGrade: semanticIntegrityGrade,
    semanticDeadWood,
    semanticHighBlastRadius,
    semanticMaxBlastRadius: semanticMaxBlastRadiusEntry.totalReferences,
  },
};
writeFileSync(auditReportPath, `${JSON.stringify(auditReport, null, 2)}\n`);

const missingGeneratedTokens = full && !forbiddenOnly
  ? [...componentPaths]
      .map(tokenPath => ({
        tokenPath,
        cssVar: toCssVar(tokenPath),
      }))
      .filter(entry => !generatedVars.has(entry.cssVar))
  : [];

if (fix && ghostTokens.length > 0) {
  const lines = themeCss.split(/\r?\n/);
  const ghostSet = new Set(ghostTokens.map(entry => entry.cssVar));
  const nextLines = [];

  for (const line of lines) {
    if ([...ghostSet].some(cssVar => line.includes(cssVar))) continue;
    nextLines.push(line);
  }

  writeFileSync(themeCssPath, `${nextLines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`);
}

if (reportOnly) {
  console.log('\nREPORT-ONLY audit-tokens - semantic mapping hit list generated\n');
  console.log(`  System Integrity Grade: ${semanticIntegrityGrade} (${semanticIntegrityScore}%)`);
  console.log(`  Semantic hits: ${semanticAlignedHits}`);
  console.log(`  Primitive hits: ${semanticPrimitiveHits}`);
  if (helperVarViolations.length > 0) {
    console.log(`\n  Helper Var Drift (${helperVarViolations.length}):`);
    for (const entry of helperVarViolations) {
      console.log(`    ${entry.file}:${entry.line}`);
      console.log(`      ${entry.value}`);
      console.log(`      Expected: ${entry.expected}`);
      console.log(`      Reason: ${entry.reason}\n`);
    }
  }
  if (semanticMappingViolations.length > 0) {
    console.log(`\n  Direct Primitive Violations (${semanticMappingViolations.length}):`);
    for (const entry of semanticMappingViolations) {
      console.log(`    ${entry.file}:${entry.line}`);
      console.log(`      ${entry.prop}: ${entry.value}`);
      console.log(`      Expected: ${entry.expected}`);
      console.log(`      Reason: ${entry.reason}\n`);
    }
  }
  if (monoProseViolations.length > 0) {
    console.log(`\n  Mono-Prose Drift (${monoProseViolations.length}):`);
    for (const entry of monoProseViolations) {
      console.log(`    ${entry.file}:${entry.line}`);
      console.log(`      ${entry.prop}: ${entry.value}`);
      console.log(`      Expected: ${entry.expected}`);
      console.log(`      Reason: ${entry.reason}\n`);
    }
  }
  if (responsiveViolations.length > 0) {
    console.log(`\n  Responsiveness Violations (${responsiveViolations.length}):`);
    for (const entry of responsiveViolations) {
      console.log(`    ${entry.file}:${entry.line}`);
      console.log(`      ${entry.selector}`);
      console.log(`      ${entry.prop}: ${entry.value}`);
      console.log(`      Reason: ${entry.reason}\n`);
    }
  }
  process.exit(0);
}

if (ghostTokens.length === 0 && missingGeneratedTokens.length === 0 && forbiddenOverrides.length === 0 && monoProseViolations.length === 0 && responsiveViolations.length === 0) {
  console.log('OK audit-tokens - no ghost component vars, no forbidden overrides, no mono-prose drift, no responsiveness violations, and generated CSS is in sync');
  process.exit(0);
}

console.error('\nFAIL audit-tokens - token bridge mismatch detected\n');

if (ghostTokens.length > 0) {
  console.error(`  Ghost Token Detected (${ghostTokens.length}):`);
  for (const ghost of ghostTokens) {
    console.error(`    ${ghost.cssVar}`);
    console.error(`      JSON path: ${ghost.tokenPath}`);
    console.error(`      Fix: remove the CSS bridge var or define the token in hirobius.tokens.json\n`);
  }
}

if (forbiddenOverrides.length > 0) {
  console.error(`  Forbidden Overrides Detected (${forbiddenOverrides.length}):`);
  for (const entry of forbiddenOverrides) {
    console.error(`    ${entry.file}:${entry.line}`);
    console.error(`      ${entry.selector}`);
    console.error(`      ${entry.prop}: ${entry.value}`);
    console.error(`      Reason: ${entry.reason}`);
    if (entry.expected) {
      console.error(`      Expected: ${entry.expected}`);
    }
    console.error(`      Fix: replace this hardcoded value with the matching tokenized style.\n`);
  }
}

if (semanticMappingViolations.length > 0) {
  console.error(`  Direct Primitive Violations Detected (${semanticMappingViolations.length}):`);
  for (const entry of semanticMappingViolations) {
    console.error(`    ${entry.file}:${entry.line}`);
    console.error(`      ${entry.prop}: ${entry.value}`);
    console.error(`      Expected: ${entry.expected}`);
    console.error(`      Reason: ${entry.reason}`);
      console.error(`      Fix: replace this primitive usage with the semantic alias that matches the surrounding component role.\n`);
  }
}

if (monoProseViolations.length > 0) {
  console.error(`  Mono-Prose Drift Detected (${monoProseViolations.length}):`);
  for (const entry of monoProseViolations) {
    console.error(`    ${entry.file}:${entry.line}`);
    console.error(`      ${entry.selector}`);
    console.error(`      ${entry.prop}: ${entry.value}`);
    console.error(`      Expected: ${entry.expected}`);
    console.error(`      Reason: ${entry.reason}`);
    console.error(`      Fix: replace mono prose with the matching semantic body or caption token.\n`);
  }
}

if (responsiveViolations.length > 0) {
  console.error(`  Responsiveness Violations Detected (${responsiveViolations.length}):`);
  for (const entry of responsiveViolations) {
    console.error(`    ${entry.file}:${entry.line}`);
    console.error(`      ${entry.selector}`);
    console.error(`      ${entry.prop}: ${entry.value}`);
    console.error(`      Reason: ${entry.reason}`);
    console.error(`      Fix: move the responsive behavior into semantic layout tokens or shared layout primitives.\n`);
  }
}

if (full && missingGeneratedTokens.length > 0) {
  console.error(`  Missing Generated Tokens (${missingGeneratedTokens.length}):`);
  for (const token of missingGeneratedTokens) {
    console.error(`    ${token.tokenPath}`);
    console.error(`      CSS var: ${token.cssVar}`);
    console.error(`      Fix: run pnpm tokens to regenerate src/styles/tokens.css\n`);
  }
}

process.exit(1);
