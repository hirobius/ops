#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * normalize-figma-snapshot.mjs
 *
 * Convert transport-specific Figma export JSON into the stable snapshot shape
 * used by `scripts/audit-figma-system.mjs`.
 *
 * Supported snapshot output:
 * - variables
 * - components
 * - styles
 * - pages
 * - nodes
 * - collections
 *
 * The normalizer is intentionally permissive: it looks for arrays named the
 * same thing anywhere in the raw payload, so the local/Desktop Bridge export,
 * the official MCP path, or a manual intermediate file can all feed it.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, relative, resolve } from 'path';

const ROOT = process.cwd();

function parseArgs(argv) {
  const flags = {
    input: null,
    output: null,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') {
      flags.input = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === '--output') {
      flags.output = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === '--json') {
      flags.json = true;
    } else if (arg === '--help' || arg === '-h') {
      flags.help = true;
    }
  }

  return flags;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
}

function normalizeName(value) {
  return String(value ?? '').trim();
}

function normalizeArray(raw, key, visitor) {
  const out = [];

  function walk(node) {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }

    for (const [childKey, childValue] of Object.entries(node)) {
      if (childKey === key && Array.isArray(childValue)) {
        for (const item of childValue) {
          const normalized = visitor(item);
          if (normalized) out.push(normalized);
        }
      }
      walk(childValue);
    }
  }

  walk(raw);
  return out;
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = normalizeName(keyFn(item));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function normalizeCollection(item) {
  const variables = Array.isArray(item?.variables)
    ? item.variables.map((variable) => ({
        name: normalizeName(variable?.name ?? variable?.path ?? variable?.key),
        key: normalizeName(variable?.key),
        id: normalizeName(variable?.id),
        mode: normalizeName(variable?.mode),
        type: normalizeName(variable?.type),
      })).filter((entry) => entry.name || entry.key || entry.id)
    : [];

  return {
    name: normalizeName(item?.name),
    key: normalizeName(item?.key),
    id: normalizeName(item?.id),
    modeCount: Array.isArray(item?.modes) ? item.modes.length : 0,
    variableCount: variables.length,
    variables,
  };
}

function normalizeVariable(item) {
  return {
    name: normalizeName(item?.name ?? item?.path ?? item?.key),
    key: normalizeName(item?.key),
    id: normalizeName(item?.id),
    collection: normalizeName(item?.collection ?? item?.collectionName),
    mode: normalizeName(item?.mode),
    type: normalizeName(item?.type ?? item?.resolvedType),
    path: Array.isArray(item?.path) ? item.path.map(normalizeName).filter(Boolean) : undefined,
  };
}

function normalizeComponent(item) {
  return {
    name: normalizeName(item?.name ?? item?.path ?? item?.key),
    key: normalizeName(item?.key),
    id: normalizeName(item?.id),
    variant: normalizeName(item?.variant),
    fileKey: normalizeName(item?.fileKey),
    nodeId: normalizeName(item?.nodeId),
  };
}

function normalizeStyle(item) {
  return {
    name: normalizeName(item?.name ?? item?.key),
    key: normalizeName(item?.key),
    id: normalizeName(item?.id),
    type: normalizeName(item?.type ?? item?.styleType),
  };
}

function normalizePage(item) {
  return {
    name: normalizeName(item?.name ?? item?.key),
    id: normalizeName(item?.id),
    key: normalizeName(item?.key),
  };
}

function normalizeNode(item) {
  return {
    name: normalizeName(item?.name ?? item?.key),
    id: normalizeName(item?.id),
    type: normalizeName(item?.type),
    pageName: normalizeName(item?.pageName ?? item?.page),
    parentId: normalizeName(item?.parentId),
  };
}

const flags = parseArgs(process.argv.slice(2));

if (flags.help || !flags.input) {
  console.log([
    'Usage: node scripts/normalize-figma-snapshot.mjs --input <raw.json> [--output <normalized.json>] [--json]',
    '',
    'Reads a raw Figma export payload and writes a normalized snapshot with:',
    '- variables',
    '- components',
    '- styles',
    '- pages',
    '- nodes',
    '- collections',
  ].join('\n'));
  process.exit(flags.input ? 0 : 1);
}

const inputPath = resolve(ROOT, flags.input);
if (!existsSync(inputPath)) {
  throw new Error(`Input file not found: ${relative(ROOT, inputPath).replace(/\\/g, '/')}`);
}

const raw = readJson(inputPath);

const collections = dedupeBy(
  normalizeArray(raw, 'collections', normalizeCollection),
  (item) => `${item.name}|${item.id}|${item.key}`
);

const variables = dedupeBy(
  normalizeArray(raw, 'variables', normalizeVariable),
  (item) => `${item.name}|${item.id}|${item.key}|${item.collection}|${item.mode}|${item.type}`
);

const components = dedupeBy(
  normalizeArray(raw, 'components', normalizeComponent),
  (item) => `${item.name}|${item.id}|${item.key}|${item.fileKey}|${item.nodeId}|${item.variant}`
);

const styles = dedupeBy(
  normalizeArray(raw, 'styles', normalizeStyle),
  (item) => `${item.name}|${item.id}|${item.key}|${item.type}`
);

const pages = dedupeBy(
  normalizeArray(raw, 'pages', normalizePage),
  (item) => `${item.name}|${item.id}|${item.key}`
);

const nodes = dedupeBy(
  normalizeArray(raw, 'nodes', normalizeNode),
  (item) => `${item.name}|${item.id}|${item.type}|${item.pageName}|${item.parentId}`
);

const normalized = {
  source: {
    input: relative(ROOT, inputPath).replace(/\\/g, '/'),
    normalizedAt: new Date().toISOString(),
  },
  collections,
  variables,
  components,
  styles,
  pages,
  nodes,
  counts: {
    collections: collections.length,
    variables: variables.length,
    components: components.length,
    styles: styles.length,
    pages: pages.length,
    nodes: nodes.length,
  },
};

if (flags.output) {
  const outputPath = join(ROOT, flags.output);
  writeFileSync(outputPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
}

if (flags.json || !flags.output) {
  console.log(JSON.stringify(normalized, null, 2));
}
