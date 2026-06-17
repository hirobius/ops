#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * generate-component-api.mjs
 *
 * Builds a JSON manifest of exported component props from
 * src/app/components/*.tsx using react-docgen-typescript.
 *
 * Output:
 *   src/app/data/component-api.json
 *
 * The manifest is consumed by HDS doc pages to render generated prop tables
 * and by llms.txt generation to provide machine-readable API context.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import reactDocgenTypescript from 'react-docgen-typescript';
import { discoverHdsComponents } from './component-discovery.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT_FILE = join(ROOT, 'src', 'app', 'data', 'component-api.json');
const TSCONFIG_FILE = join(ROOT, 'tsconfig.json');

const parser = reactDocgenTypescript.withCustomConfig(TSCONFIG_FILE, {
  shouldExtractLiteralValuesFromEnum: true,
  shouldExtractValuesFromUnion: true,
  shouldRemoveUndefinedFromOptional: true,
  savePropValueAsString: true,
  propFilter: (prop) => {
    const parentFile = prop.parent?.fileName ?? '';
    return !parentFile.includes('node_modules');
  },
});

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function stripMatchingWrapper(value, open, close) {
  const trimmed = cleanText(value);
  if (!trimmed.startsWith(open) || !trimmed.endsWith(close)) return trimmed;

  let depth = 0;
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (char === open) depth += 1;
    if (char === close) depth -= 1;
    if (depth === 0 && index < trimmed.length - 1) return trimmed;
  }

  return trimmed.slice(1, -1).trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripJsDocBlock(block) {
  const text = block
    .replace(/^\/\*\*?/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trim())
    .filter((line) => line && !line.startsWith('@'))
    .join(' ');

  return cleanText(text);
}

function resolvePrimaryJsDocBlock(source, displayName) {
  const escapedName = escapeRegExp(displayName);
  const followers = [
    new RegExp(`^\\s*export\\s+const\\s+${escapedName}\\b`),
    new RegExp(`^\\s*export\\s+function\\s+${escapedName}\\b`),
    new RegExp(`^\\s*export\\s+default\\s+function\\s+${escapedName}\\b`),
  ];

  const jsdocPattern = /\/\*\*[\s\S]*?\*\//g;
  let match;
  while ((match = jsdocPattern.exec(source)) !== null) {
    const after = source.slice(match.index + match[0].length);
    if (followers.some((rx) => rx.test(after))) return match[0];
  }

  return source.match(/\/\*\*[\s\S]*?\*\//)?.[0] ?? '';
}

function extractComponentDescription(source, displayName) {
  const block = resolvePrimaryJsDocBlock(source, displayName);
  return block ? stripJsDocBlock(block) : '';
}

function extractComponentGuides(source, displayName) {
  const block = resolvePrimaryJsDocBlock(source, displayName);
  if (!block) return [];

  return block
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trim())
    .filter((line) => line.startsWith('@guide '))
    .map((line) => line.replace(/^@guide\s+/, '').trim())
    .map((line, index) => {
      const [label, ...rest] = line.split(':');
      const text = cleanText(rest.join(':'));

      if (!text) {
        return {
          label: `Guide ${index + 1}`,
          text: cleanText(label),
        };
      }

      return {
        label: cleanText(label),
        text,
      };
    })
    .filter((entry) => entry.label && entry.text);
}

function extractTypeAliases(source) {
  const aliases = new Map();
  const typePattern = /type\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]*?);/g;

  for (const match of source.matchAll(typePattern)) {
    const [, name, rawValue] = match;
    aliases.set(name, cleanText(rawValue));
  }

  return aliases;
}

function splitTopLevelUnion(value) {
  const parts = [];
  let current = '';
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let inSingle = false;
  let inDouble = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const prev = value[index - 1];

    if (char === "'" && !inDouble && prev !== '\\') {
      inSingle = !inSingle;
      current += char;
      continue;
    }

    if (char === '"' && !inSingle && prev !== '\\') {
      inDouble = !inDouble;
      current += char;
      continue;
    }

    if (inSingle || inDouble) {
      current += char;
      continue;
    }

    if (char === '(') depthParen += 1;
    if (char === ')') depthParen = Math.max(0, depthParen - 1);
    if (char === '{') depthBrace += 1;
    if (char === '}') depthBrace = Math.max(0, depthBrace - 1);
    if (char === '[') depthBracket += 1;
    if (char === ']') depthBracket = Math.max(0, depthBracket - 1);

    if (char === '|' && depthParen === 0 && depthBrace === 0 && depthBracket === 0) {
      parts.push(cleanText(current));
      current = '';
      continue;
    }

    current += char;
  }

  if (cleanText(current)) parts.push(cleanText(current));
  return parts.filter(Boolean);
}

function tryResolveLiteralUnion(typeName, aliases, trail = new Set()) {
  if (!typeName || !aliases.has(typeName) || trail.has(typeName)) return undefined;
  trail.add(typeName);

  const rawAlias = stripMatchingWrapper(aliases.get(typeName), '(', ')');
  const parts = splitTopLevelUnion(rawAlias);
  if (parts.length === 0) return undefined;

  const resolved = [];
  for (const part of parts) {
    if (/^(['"]).*\1$/.test(part) || /^(true|false|null|undefined)$/.test(part)) {
      resolved.push(part);
      continue;
    }

    const nested = tryResolveLiteralUnion(part, aliases, trail);
    if (!nested) return undefined;
    resolved.push(...splitTopLevelUnion(nested));
  }

  return [...new Set(resolved)].join(' | ');
}

function formatType(type, aliases = new Map()) {
  if (!type) return 'unknown';

  if (typeof type.raw === 'string' && type.raw.trim()) {
    const raw = cleanText(type.raw);
    return tryResolveLiteralUnion(raw, aliases) ?? raw;
  }

  if (type.name === 'union' && Array.isArray(type.value)) {
    return type.value.map((value) => formatTypeValue(value, aliases)).join(' | ');
  }

  if (type.name === 'intersection' && Array.isArray(type.value)) {
    return type.value.map((value) => formatTypeValue(value, aliases)).join(' & ');
  }

  if (type.name === 'enum' && Array.isArray(type.value)) {
    return type.value
      .map((option) => cleanText(option?.value ?? option?.name ?? 'unknown'))
      .join(' | ');
  }

  if (type.name === 'Array' && type.value) {
    return `Array<${formatTypeValue(type.value, aliases)}>`;
  }

  const name = cleanText(type.name || 'unknown');
  return tryResolveLiteralUnion(name, aliases) ?? name;
}

function formatTypeValue(value, aliases = new Map()) {
  if (typeof value === 'string') {
    const cleaned = cleanText(value);
    return tryResolveLiteralUnion(cleaned, aliases) ?? cleaned;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => formatTypeValue(entry, aliases)).join(' | ');
  }

  if (value && typeof value === 'object') {
    return formatType(value, aliases);
  }

  return 'unknown';
}

function resolveDefaultValue(defaultValue) {
  if (!defaultValue || defaultValue.value == null) return undefined;
  const value = cleanText(defaultValue.value);
  return value || undefined;
}

function normalizeHdsTokenPath(raw) {
  const expression = cleanText(raw);
  if (!expression.startsWith('hds.')) return undefined;

  const segments = [...expression.matchAll(/(?:\.([A-Za-z_][A-Za-z0-9_]*))|(?:\[(\d+|"(?:[^"]+)"|'(?:[^']+)')\])/g)]
    .map(([, dotKey, bracketKey]) => {
      const value = dotKey ?? bracketKey ?? '';
      return value.replace(/^['"]|['"]$/g, '');
    })
    .filter(Boolean);

  if (segments.length === 0) return undefined;

  const [root, ...rest] = segments;

  if (root === 'semantic' && rest[0] === 'space' && rest[1] === 'stack' && rest[2] === 'gap') {
    return 'semantic.space.section.stack';
  }
  if (root === 'semantic') return ['semantic', ...rest].join('.');
  if (root === 'space') return rest.length > 0 ? ['primitive', 'space', ...rest].join('.') : undefined;
  if (root === 'size') return rest.length > 0 ? ['primitive', 'size', ...rest].join('.') : undefined;
  if (root === 'fontFamily') return 'primitive.typography.family.primary';
  if (root === 'monoFamily') return 'primitive.typography.family.mono';
  if (root === 'fontSize') return rest.length > 0 ? ['primitive', 'typography', 'size', ...rest].join('.') : undefined;
  if (root === 'fontWeight') return rest.length > 0 ? ['primitive', 'typography', 'weight', ...rest].join('.') : undefined;
  if (root === 'lineHeight') return rest.length > 0 ? ['primitive', 'typography', 'lineHeight', ...rest].join('.') : undefined;
  if (root === 'letterSpacing') return rest.length > 0 ? ['primitive', 'typography', 'letterSpacing', ...rest].join('.') : undefined;
  if (root === 'borderRadius') {
    if (rest[0] === 'action') return 'semantic.radius.action';
    if (rest[0] === 'circle') return undefined;
    return rest.length > 0 ? ['primitive', 'radius', ...rest].join('.') : undefined;
  }
  if (root === 'borderWidth') {
    if (rest[0] === 'default' || rest[0] === 'emphasis') return ['semantic', 'borderWidth', ...rest].join('.');
    return rest.length > 0 ? ['primitive', 'borderWidth', ...rest].join('.') : undefined;
  }
  if (root === 'typeStyles') {
    // 12t-typography-truth-up: every legacy alias resolves to one of the 8
    // Swiss-canon composites (display, h1, h2, h3, body, small, caption, mono)
    // matching tokens.ts. Pre-rename names map to whichever composite their
    // alias points at — never to a non-existent semantic.typography.* path.
    const map = {
      display: 'semantic.typography.display',
      h1: 'semantic.typography.h1',
      h2: 'semantic.typography.h2',
      h3: 'semantic.typography.h3',
      body: 'semantic.typography.body',
      small: 'semantic.typography.small',
      caption: 'semantic.typography.caption',
      mono: 'semantic.typography.mono',
      heading1: 'semantic.typography.h1',
      heading2: 'semantic.typography.h2',
      heading3: 'semantic.typography.h3',
      ui: 'semantic.typography.small',
      technical: 'semantic.typography.mono',
      badge: 'semantic.typography.caption',
      displayXl: 'semantic.typography.display',
      display1: 'semantic.typography.display',
      display2: 'semantic.typography.h1',
      headingHero: 'semantic.typography.h1',
      headingSection: 'semantic.typography.h3',
      title: 'semantic.typography.body',
      body2: 'semantic.typography.body',
      bodyLarge: 'semantic.typography.body',
      bodySmall: 'semantic.typography.small',
      micro: 'semantic.typography.caption',
      monoXs: 'semantic.typography.mono',
      monoSm: 'semantic.typography.mono',
      label: 'semantic.typography.small',
      labelDescriptive: 'semantic.typography.small',
      labelTechnical: 'semantic.typography.mono',
    };
    return map[rest[0]];
  }
  if (root === 'layout') {
    const map = {
      pageGutterH: 'semantic.layout.page.gutterX',
      mobileGutterH: 'semantic.layout.page.gutterXMobile',
      sectionPad: 'semantic.layout.section.paddingYShell',
      sectionPadSm: 'semantic.layout.section.paddingYShellTight',
      panelGap: 'semantic.layout.panel.gap',
      panelGapMob: 'semantic.layout.panel.gapMobile',
      containerMaxWidth: 'semantic.layout.container.maxWidth',
      contentMaxWidth: 'semantic.layout.content.maxWidth',
      proseMaxWidth: 'semantic.layout.prose.maxWidth',
      sectionPaddingY: 'semantic.layout.section.paddingY',
      gridColumnGap: 'semantic.layout.grid.gap',
    };
    return map[rest[0]];
  }
  if (root === 'iconSize') {
    const map = {
      small: 'primitive.typography.size.base',
      medium: 'primitive.typography.size.lg',
      large: 'primitive.typography.size.xl',
    };
    return map[rest[0]];
  }
  if (root === 'motion') {
    const map = {
      productive: 'primitive.duration.short',
      expressive: 'primitive.duration.medium',
      spatial: 'primitive.duration.long',
      exit: 'primitive.duration.instant',
    };
    if (rest[1] === 'duration') return map[rest[0]];
    return undefined;
  }
  if (root === 'color') {
    if (rest[0] === 'content' || rest[0] === 'surface' || rest[0] === 'feedback') return ['semantic', 'color', ...rest].join('.');
    if (rest[0] === 'brand') return 'primitive.color.blue.500';
    if (rest[0] === 'brandPressed') return 'primitive.color.blue.600';
    if (rest[0] === 'white') return 'primitive.color.neutral.white';
    if (rest[0] === 'blue') return ['primitive', 'color', ...rest].join('.');
    return undefined;
  }

  return undefined;
}

function extractObservedTokens(source) {
  const matches = [...source.matchAll(/\bhds(?:\.[A-Za-z_][A-Za-z0-9_]*|\[(?:\d+|'[^']+'|"[^"]+")\])+/g)];
  const seen = new Set();
  const tokens = [];

  for (const match of matches) {
    const raw = cleanText(match[0]);
    if (seen.has(raw)) continue;
    seen.add(raw);
    const index = typeof match.index === 'number' ? match.index : 0;
    const before = source.slice(0, index);
    const sourceLine = before.split('\n').length;
    const lineStart = source.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
    const lineEnd = source.indexOf('\n', index);
    const sourceSnippet = cleanText(source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd));
    tokens.push({
      raw,
      tokenPath: normalizeHdsTokenPath(raw),
      sourceLine,
      sourceSnippet,
    });
  }

  return tokens;
}

function toPropRow(propName, prop, aliases) {
  return {
    name: propName,
    type: formatType(prop.type, aliases),
    default: resolveDefaultValue(prop.defaultValue),
    required: Boolean(prop.required),
    description: cleanText(prop.description),
  };
}

export function buildManifest() {
  const discoveredComponents = discoverHdsComponents().components
    .filter((component) => !component.ignored)
    .filter((component) => component.tier === 'primitive' || component.tier === 'pattern');
  const files = [...new Set(discoveredComponents.map((component) => join(ROOT, component.filePath)))];
  const discoveredNames = new Set(discoveredComponents.map((component) => component.name));
  const metadataByName = new Map(discoveredComponents.map((component) => [component.name, component]));
  const fileSourceByRelativePath = new Map(
    files.map((filePath) => [
      relative(ROOT, filePath).replace(/\\/g, '/'),
      readFileSync(filePath, 'utf8'),
    ]),
  );

  const docs = parser.parse(files)
    .filter((doc) => doc?.displayName && discoveredNames.has(doc.displayName))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const components = {};

  for (const doc of docs) {
    const relativePath = doc.filePath ? relative(ROOT, doc.filePath).replace(/\\/g, '/') : undefined;
    const source = relativePath ? fileSourceByRelativePath.get(relativePath) ?? '' : '';
    const aliases = extractTypeAliases(source);
    const metadata = metadataByName.get(doc.displayName);
    const props = Object.entries(doc.props ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([propName, prop]) => toPropRow(propName, prop, aliases));
    const observedTokens = extractObservedTokens(source);
    const guides = extractComponentGuides(source, doc.displayName);

    components[doc.displayName] = {
      filePath: relativePath ?? metadata?.filePath,
      description: cleanText(doc.description) || metadata?.description || extractComponentDescription(source, doc.displayName),
      ...(metadata?.category ? { category: metadata.category } : {}),
      ...(metadata ? { hidden: Boolean(metadata.hidden) } : {}),
      ...(metadata?.figmaUrl ? { figmaUrl: metadata.figmaUrl } : {}),
      props,
      ...(guides.length > 0 ? { guides } : {}),
      observedTokens,
    };
  }

  for (const metadata of discoveredComponents) {
    if (components[metadata.name]) continue;
    const source = fileSourceByRelativePath.get(metadata.filePath) ?? '';

    components[metadata.name] = {
      filePath: metadata.filePath,
      description: metadata.description || extractComponentDescription(source, metadata.name),
      ...(metadata.category ? { category: metadata.category } : {}),
      hidden: Boolean(metadata.hidden),
      ...(metadata.figmaUrl ? { figmaUrl: metadata.figmaUrl } : {}),
      props: [],
      ...(extractComponentGuides(source, metadata.name).length > 0 ? { guides: extractComponentGuides(source, metadata.name) } : {}),
      observedTokens: extractObservedTokens(source),
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    source: 'react-docgen-typescript@2.4.0',
    components,
  };
}

export function writeManifest() {
  const manifest = buildManifest();
  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function main() {
  writeManifest();
  console.log(`✓ ${OUTPUT_FILE}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
