#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * Hirobius Design System - Automated System Linter
 *
 * Add this package.json script:
 *   "hds:lint": "node scripts/hds-lint.js"
 *
 * Run:
 *   pnpm hds:lint
 *   npm run hds:lint
 *
 * Scans .tsx and .ts files in components/, layouts/, and pages/ roots.
 *
 * Fails on:
 *   1. Hardcoded numeric or px values passed to layout props:
 *      gap="12px", padding="10px", mt={15}, padding: '10px'
 *      Use semantic/token values instead: gap="px16", gap="space.4",
 *      padding={hds.space.px20}, or padding={hds.semantic.space.component.padding}.
 *   2. Any JSX usage of <Divider>.
 *   3. Technical tone on <Badge>.
 *   4. Native DOM elements in pages/layouts with direct HDS equivalents,
 *      unless the file is explicitly marked with // @hds-incubation.
 *   5. Typography usage outside the 9-style ramp:
 *      display, heading1, heading2, heading3, body, ui, caption, technical, badge.
 *   6. Forbidden component usage such as <Divider> and <HdsTriangle>.
 *   7. Hardcoded color literals in .tsx files.
 *   8. Hardcoded zIndex numbers, borderRadius values, or boxShadow values.
 *
 * Exemptions:
 *   - Add hds-bypass anywhere in a file to skip intentionally non-compliant
 *     visual audit fixtures.
 *   - Add hds-lint-ignore on the same line to skip a one-off finding.
 *   - Add // @hds-incubation to a draft file to emit an incubation warning and
 *     bypass native DOM violations in that file.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { dirname, extname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SCAN_ROOTS = [
  join(ROOT, 'components'),
  join(ROOT, 'layouts'),
  join(ROOT, 'pages'),
  join(ROOT, 'src', 'app', 'components'),
  join(ROOT, 'src', 'app', 'layouts'),
  join(ROOT, 'src', 'app', 'pages'),
].filter((dir) => existsSync(dir));

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);

const LAYOUT_PROPS = [
  'gap',
  'rowGap',
  'columnGap',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingBlock',
  'paddingBlockStart',
  'paddingBlockEnd',
  'paddingInline',
  'paddingInlineStart',
  'paddingInlineEnd',
  'p',
  'px',
  'py',
  'pt',
  'pr',
  'pb',
  'pl',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginBlock',
  'marginBlockStart',
  'marginBlockEnd',
  'marginInline',
  'marginInlineStart',
  'marginInlineEnd',
  'm',
  'mx',
  'my',
  'mt',
  'mr',
  'mb',
  'ml',
  'inset',
  'top',
  'right',
  'bottom',
  'left',
];

const ALLOWED_TYPOGRAPHY_TOKENS = new Set([
  'display',
  'heading1',
  'heading2',
  'heading3',
  'body',
  'ui',
  'caption',
  'technical',
  'badge',
]);

const DEPRECATED_TYPOGRAPHY_TOKENS = [
  'micro',
  'label',
  'labelDescriptive',
  'labelTechnical',
  'monoXs',
  'monoSm',
  'body2',
  'title',
];
const DEPRECATED_TYPOGRAPHY_TOKEN_SET = new Set(DEPRECATED_TYPOGRAPHY_TOKENS);
const PROP_PATTERN = LAYOUT_PROPS.join('|');
const TYPOGRAPHY_PATTERN = DEPRECATED_TYPOGRAPHY_TOKENS.join('|');

const JSX_PX_LAYOUT_PROP = new RegExp(
  String.raw`\b(${PROP_PATTERN})\s*=\s*["'](-?\d+(?:\.\d+)?)px["']`,
  'g',
);
const JSX_NUMERIC_LAYOUT_PROP = new RegExp(
  String.raw`\b(${PROP_PATTERN})\s*=\s*\{\s*(-?\d+(?:\.\d+)?)\s*\}`,
  'g',
);
const JSX_BRACED_PX_LAYOUT_PROP = new RegExp(
  String.raw`\b(${PROP_PATTERN})\s*=\s*\{\s*["'](-?\d+(?:\.\d+)?)px["']\s*\}`,
  'g',
);
const JSX_BRACED_NUMERIC_STRING_LAYOUT_PROP = new RegExp(
  String.raw`\b(${PROP_PATTERN})\s*=\s*\{\s*["'](-?\d+(?:\.\d+)?)["']\s*\}`,
  'g',
);
const JSX_NUMERIC_STRING_LAYOUT_PROP = new RegExp(
  String.raw`\b(${PROP_PATTERN})\s*=\s*["'](-?\d+(?:\.\d+)?)["']`,
  'g',
);
const OBJECT_PX_LAYOUT_PROP = new RegExp(
  String.raw`\b(${PROP_PATTERN})\s*:\s*["'](-?\d+(?:\.\d+)?)px["']`,
  'g',
);
const OBJECT_NUMERIC_LAYOUT_PROP = new RegExp(
  String.raw`\b(${PROP_PATTERN})\s*:\s*(-?\d+(?:\.\d+)?)\s*(?:,|})`,
  'g',
);
const FORBIDDEN_COMPONENTS = new Map([
  ['Divider', '<Divider> is forbidden; use layout spacing between sections instead.'],
  ['HdsTriangle', '<HdsTriangle> is forbidden; the retired geometry playground must not return to the app surface.'],
]);
const FORBIDDEN_COMPONENT_PATTERN = new RegExp(
  String.raw`<\s*(${[...FORBIDDEN_COMPONENTS.keys()].join('|')})\b`,
  'g',
);
const INCUBATION_TAG = '// @hds-incubation';
const NATIVE_DOM_ELEMENTS = ['button', 'input', 'select', 'textarea', 'a'];
const NATIVE_DOM_PATTERN = new RegExp(String.raw`<\s*(?:${NATIVE_DOM_ELEMENTS.join('|')})\b`, 'g');
const HDS_BADGE_TECHNICAL_PATTERN = new RegExp(
  String.raw`<\s*Badge\b[^>]*(?:tone|variant)\s*=\s*(?:\{\s*['"]technical['"]\s*\}|['"]technical['"])`,
  'g',
);

const DEPRECATED_TYPOGRAPHY_ACCESS = new RegExp(
  String.raw`\b(?:hds\.)?(?:typeStyles|typography|semantic\.typography)\.(${TYPOGRAPHY_PATTERN})\b`,
  'g',
);
const ANY_TYPE_STYLE_ACCESS = /\bhds\.typeStyles\.([A-Za-z_$][\w$]*)\b/g;
const DEPRECATED_TYPOGRAPHY_PROP = new RegExp(
  String.raw`\b(?:typeStyle|typography|textStyle|variant|metaStyle)\s*=\s*["'](${TYPOGRAPHY_PATTERN})["']`,
  'g',
);
const ANY_TYPOGRAPHY_PROP = /\b(?:typeStyle|typography|textStyle|metaStyle)\s*=\s*["']([A-Za-z_$][\w$]*)["']/g;
const DEPRECATED_TYPOGRAPHY_VAR = new RegExp(
  String.raw`var\(--(?:hds-)?semantic-typography-(${TYPOGRAPHY_PATTERN})(?:-[^)]+)?\)`,
  'g',
);
const ANY_TYPOGRAPHY_VAR = /var\(--(?:hds-)?semantic-typography-([A-Za-z0-9_-]+)(?:-[^)]+)?\)/g;
const HARDCODED_COLOR_LITERAL = /(?:#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(\s*\d[^)]*\))/g;
const HARDCODED_Z_INDEX = /\bzIndex\s*:\s*(-?\d+(?:\.\d+)?)\b/g;
const STYLE_LITERAL_PROP = /\b(borderRadius|boxShadow)\s*:\s*([^,\n}]+)/g;
const JSX_STYLE_LITERAL_PROP = /\b(borderRadius|boxShadow)\s*=\s*(?:"([^"]+)"|'([^']+)'|\{\s*["']([^"']+)["']\s*\})/g;
const TOKEN_VAR_PATTERN = /var\(--hds-[^)]+\)/;
const HARD_RADIUS_VALUE = /(?:^|["'`])(?:-?\d+(?:\.\d+)?(?:px|rem|em|%)|9999px|50%)(?:["'`]|$)/;
const HARD_SHADOW_VALUE = /(?:^|["'`])(?:none|(?:inset\s+)?-?\d+(?:\.\d+)?px\s+-?\d+(?:\.\d+)?px|0\s+-?\d+(?:\.\d+)?px)(?:[^"'`]*)(?:["'`]|$)/;

function collectFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;

    const full = join(dir, entry);
    const stat = statSync(full);

    if (stat.isDirectory()) {
      collectFiles(full, files);
      continue;
    }

    if (['.tsx', '.ts'].includes(extname(entry))) {
      files.push(full);
    }
  }

  return files;
}

function lineAndColumn(source, index) {
  const before = source.slice(0, index);
  const lines = before.split('\n');
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

function lineText(source, lineNumber) {
  return source.split('\n')[lineNumber - 1]?.trim() ?? '';
}

function shouldIgnore(source, line) {
  return lineText(source, line).includes('hds-lint-ignore') || lineText(source, line - 1).includes('hds-lint-ignore');
}

function isZero(value) {
  return Number(value) === 0;
}

function addRegexFindings({ source, file, regex, type, messageForMatch, findings, skipZero = false }) {
  for (const match of source.matchAll(regex)) {
    const value = match[2] ?? match[1];
    if (skipZero && isZero(value)) continue;

    const position = lineAndColumn(source, match.index ?? 0);
    if (shouldIgnore(source, position.line)) continue;

    findings.push({
      file,
      line: position.line,
      column: position.column,
      type,
      message: messageForMatch(match),
      snippet: lineText(source, position.line),
    });
  }
}

function addLineFinding({ source, file, line, column, type, message, findings }) {
  if (shouldIgnore(source, line)) return;

  findings.push({
    file,
    line,
    column,
    type,
    message,
    snippet: lineText(source, line),
  });
}

function isCommentOnlyLine(source, line) {
  const text = lineText(source, line);
  return text.startsWith('//') || text.startsWith('*') || text.startsWith('/*') || text.startsWith('*/');
}

function scanFile(file) {
  const source = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const findings = [];
  const warnings = [];
  const isIncubated = source.includes(INCUBATION_TAG);
  const isComponentInventoryFile = rel.startsWith('components/') || rel.startsWith('src/app/components/');
  const isConsumerLayer =
    rel.startsWith('pages/') ||
    rel.startsWith('layouts/') ||
    rel.startsWith('src/app/pages/') ||
    rel.startsWith('src/app/layouts/');

  if (source.includes('hds-bypass')) {
    return { findings, warnings };
  }

  if (isIncubated && extname(file) === '.tsx') {
    warnings.push(
      `INCUBATION DETECTED: ${rel} contains a draft component. It must be extracted to the component library and documented.`,
    );
  }

  addRegexFindings({
    source,
    file: rel,
    regex: JSX_PX_LAYOUT_PROP,
    type: 'layout-prop',
    skipZero: true,
    findings,
    messageForMatch: ([, prop, value]) =>
      `${prop} receives hardcoded "${value}px"; use a spacing token such as "px16" or hds.semantic.space.*.`,
  });

  addRegexFindings({
    source,
    file: rel,
    regex: JSX_NUMERIC_LAYOUT_PROP,
    type: 'layout-prop',
    skipZero: true,
    findings,
    messageForMatch: ([, prop, value]) =>
      `${prop} receives hardcoded number {${value}}; use a spacing token such as "px16" or hds.space.*.`,
  });

  addRegexFindings({
    source,
    file: rel,
    regex: JSX_BRACED_PX_LAYOUT_PROP,
    type: 'layout-prop',
    skipZero: true,
    findings,
    messageForMatch: ([, prop, value]) =>
      `${prop} receives hardcoded {"${value}px"}; use a spacing token such as "px16" or hds.space.*.`,
  });

  addRegexFindings({
    source,
    file: rel,
    regex: JSX_BRACED_NUMERIC_STRING_LAYOUT_PROP,
    type: 'layout-prop',
    skipZero: true,
    findings,
    messageForMatch: ([, prop, value]) =>
      `${prop} receives hardcoded numeric string {"${value}"}; use a semantic spacing token.`,
  });

  addRegexFindings({
    source,
    file: rel,
    regex: JSX_NUMERIC_STRING_LAYOUT_PROP,
    type: 'layout-prop',
    skipZero: true,
    findings,
    messageForMatch: ([, prop, value]) =>
      `${prop} receives hardcoded numeric string "${value}"; use a semantic spacing token.`,
  });

  addRegexFindings({
    source,
    file: rel,
    regex: OBJECT_PX_LAYOUT_PROP,
    type: 'layout-style',
    skipZero: true,
    findings,
    messageForMatch: ([, prop, value]) =>
      `${prop} uses hardcoded "${value}px"; use hds.space.*, hds.semantic.space.*, or a CSS token var.`,
  });

  addRegexFindings({
    source,
    file: rel,
    regex: OBJECT_NUMERIC_LAYOUT_PROP,
    type: 'layout-style',
    skipZero: true,
    findings,
    messageForMatch: ([, prop, value]) =>
      `${prop} uses hardcoded number ${value}; use hds.space.*, hds.semantic.space.*, or a CSS token var.`,
  });

  addRegexFindings({
    source,
    file: rel,
    regex: FORBIDDEN_COMPONENT_PATTERN,
    type: 'forbidden-component',
    findings,
    messageForMatch: ([, componentName]) =>
      FORBIDDEN_COMPONENTS.get(componentName) ?? `<${componentName}> is forbidden in HDS app surfaces.`,
  });

  addRegexFindings({
    source,
    file: rel,
    regex: HDS_BADGE_TECHNICAL_PATTERN,
    type: 'forbidden-badge-technical',
    findings,
    messageForMatch: () =>
      'Badge must not use technical tone or variant; reserve technical for code and data payloads, not badges or tags.',
  });

  if (!isIncubated && isConsumerLayer && !isComponentInventoryFile) {
    addRegexFindings({
      source,
      file: rel,
      regex: NATIVE_DOM_PATTERN,
      type: 'native-dom-element',
      findings,
      messageForMatch: () =>
        'Violation: Native DOM element used. Please use the corresponding <Hds...> component to ensure system compliance.',
    });
  }

  addRegexFindings({
    source,
    file: rel,
    regex: DEPRECATED_TYPOGRAPHY_ACCESS,
    type: 'deprecated-typography',
    findings,
    messageForMatch: ([, token]) =>
      `Deprecated typography token "${token}" is used; use body, ui, caption, technical, or badge as appropriate.`,
  });

  for (const match of source.matchAll(ANY_TYPE_STYLE_ACCESS)) {
    const token = match[1];
    if (ALLOWED_TYPOGRAPHY_TOKENS.has(token)) continue;
    if (DEPRECATED_TYPOGRAPHY_TOKEN_SET.has(token)) continue;

    const position = lineAndColumn(source, match.index ?? 0);
    if (shouldIgnore(source, position.line)) continue;

    findings.push({
      file: rel,
      line: position.line,
      column: position.column,
      type: 'typography-ramp',
      message: `Typography style "${token}" is outside the strict 9-style ramp.`,
      snippet: lineText(source, position.line),
    });
  }

  addRegexFindings({
    source,
    file: rel,
    regex: DEPRECATED_TYPOGRAPHY_PROP,
    type: 'deprecated-typography',
    findings,
    messageForMatch: ([, token]) => `Deprecated typography token prop "${token}" is used; use the 9-style type ramp.`,
  });

  for (const match of source.matchAll(ANY_TYPOGRAPHY_PROP)) {
    const token = match[1];
    if (ALLOWED_TYPOGRAPHY_TOKENS.has(token)) continue;
    if (DEPRECATED_TYPOGRAPHY_TOKEN_SET.has(token)) continue;

    const position = lineAndColumn(source, match.index ?? 0);
    if (shouldIgnore(source, position.line)) continue;

    findings.push({
      file: rel,
      line: position.line,
      column: position.column,
      type: 'typography-ramp',
      message: `Typography prop "${token}" is outside the strict 9-style ramp.`,
      snippet: lineText(source, position.line),
    });
  }

  addRegexFindings({
    source,
    file: rel,
    regex: DEPRECATED_TYPOGRAPHY_VAR,
    type: 'deprecated-typography',
    findings,
    messageForMatch: ([, token]) =>
      `Deprecated typography CSS var "${token}" is used; use an active semantic typography token.`,
  });

  for (const match of source.matchAll(ANY_TYPOGRAPHY_VAR)) {
    const rawToken = match[1];
    const token = rawToken.split('-')[0];
    if (ALLOWED_TYPOGRAPHY_TOKENS.has(token)) continue;
    if (DEPRECATED_TYPOGRAPHY_TOKEN_SET.has(token)) continue;

    const position = lineAndColumn(source, match.index ?? 0);
    if (shouldIgnore(source, position.line)) continue;

    findings.push({
      file: rel,
      line: position.line,
      column: position.column,
      type: 'typography-ramp',
      message: `Typography CSS var "${rawToken}" is outside the strict 9-style ramp.`,
      snippet: lineText(source, position.line),
    });
  }

  if (extname(file) === '.tsx') {
    for (const match of source.matchAll(HARDCODED_COLOR_LITERAL)) {
      const position = lineAndColumn(source, match.index ?? 0);
      if (isCommentOnlyLine(source, position.line)) continue;
      addLineFinding({
        source,
        file: rel,
        line: position.line,
        column: position.column,
        type: 'hardcoded-color',
        message: `Hardcoded color literal "${match[0]}" found in TSX; use hirobius.tokens.json via hds tokens or CSS vars.`,
        findings,
      });
    }
  }

  for (const match of source.matchAll(HARDCODED_Z_INDEX)) {
    const position = lineAndColumn(source, match.index ?? 0);
    addLineFinding({
      source,
      file: rel,
      line: position.line,
      column: position.column,
      type: 'z-index-token',
      message: `zIndex uses hardcoded number ${match[1]}; use a z-index token such as var(--hds-z-overlay).`,
      findings,
    });
  }

  for (const match of source.matchAll(STYLE_LITERAL_PROP)) {
    const prop = match[1];
    const rawValue = match[2].trim();
    if (TOKEN_VAR_PATTERN.test(rawValue)) continue;
    if (rawValue.startsWith('hds.') || rawValue.startsWith('tokens.')) continue;

    const isHardcodedRadius = prop === 'borderRadius' && HARD_RADIUS_VALUE.test(rawValue);
    const isHardcodedShadow = prop === 'boxShadow' && HARD_SHADOW_VALUE.test(rawValue);
    if (!isHardcodedRadius && !isHardcodedShadow) continue;

    const position = lineAndColumn(source, match.index ?? 0);
    addLineFinding({
      source,
      file: rel,
      line: position.line,
      column: position.column,
      type: prop === 'borderRadius' ? 'radius-token' : 'shadow-token',
      message: `${prop} uses hardcoded value ${rawValue}; use a var(--hds-...) token mapping.`,
      findings,
    });
  }

  for (const match of source.matchAll(JSX_STYLE_LITERAL_PROP)) {
    const prop = match[1];
    const rawValue = match[2] ?? match[3] ?? match[4] ?? '';
    if (TOKEN_VAR_PATTERN.test(rawValue)) continue;

    const isHardcodedRadius = prop === 'borderRadius' && HARD_RADIUS_VALUE.test(rawValue);
    const isHardcodedShadow = prop === 'boxShadow' && HARD_SHADOW_VALUE.test(rawValue);
    if (!isHardcodedRadius && !isHardcodedShadow) continue;

    const position = lineAndColumn(source, match.index ?? 0);
    addLineFinding({
      source,
      file: rel,
      line: position.line,
      column: position.column,
      type: prop === 'borderRadius' ? 'radius-token' : 'shadow-token',
      message: `${prop} receives hardcoded value "${rawValue}"; use a var(--hds-...) token mapping.`,
      findings,
    });
  }

  return { findings, warnings };
}

const files = SCAN_ROOTS.flatMap((dir) => collectFiles(dir));
const results = files.map(scanFile);
const findings = results.flatMap((result) => result.findings);
const warnings = results.flatMap((result) => result.warnings);

if (SCAN_ROOTS.length === 0) {
  console.warn('hds-lint: no components/, layouts/, or pages/ directories found.');
  process.exit(0);
}

for (const warning of warnings) {
  console.error(`  \x1b[1m${warning}\x1b[0m`);
}

if (findings.length === 0) {
  console.log(`PASS hds-lint - scanned ${files.length} file(s).`);
  process.exit(0);
}

console.error(`\nFAIL hds-lint found ${findings.length} issue(s) across ${files.length} file(s):\n`);

for (const finding of findings) {
  console.error(`  ${finding.file}:${finding.line}:${finding.column}  [${finding.type}]`);
  console.error(`    ${finding.message}`);
  console.error(`    ${finding.snippet}\n`);
}

console.error('Fix the issue or add hds-lint-ignore on the same line with a reason.');
process.exit(1);
