#!/usr/bin/env node

/**
 * figma-diff.mjs - Compare two Figma snapshot JSON files and generate a structured diff report.
 * Structure-agnostic: recursively computes added/removed/changed keyed by JSON pointer.
 *
 * Usage:
 *   node scripts/figma-diff.mjs --from <path> --to <path> [--out <path>]
 *   node scripts/figma-diff.mjs --dry-run [--out <path>]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const argMap = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const val = args[i + 1]?.startsWith('--') ? null : args[i + 1];
    argMap[key] = val || true;
    if (val && !args[i + 1].startsWith('--')) i++;
  }
}

const dryRun = argMap.dry_run || argMap['dry-run'];
const snapshotFrom = argMap.from;
const snapshotTo = argMap.to;
const outputPath = argMap.out || '/tmp/figma-diff.json';

let fromPath, toPath;

if (dryRun) {
  fromPath = null;
  toPath = null;
} else if (snapshotFrom && snapshotTo) {
  fromPath = path.resolve(snapshotFrom);
  toPath = path.resolve(snapshotTo);
} else {
  console.error('Usage: node scripts/figma-diff.mjs --from <path> --to <path> [--out <path>]');
  console.error('       node scripts/figma-diff.mjs --dry-run [--out <path>]');
  process.exit(1);
}

function loadSnapshot(filePath) {
  if (!filePath) return null;
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`Error loading snapshot ${filePath}:`, e.message);
    process.exit(1);
  }
}

function createSyntheticSnapshots() {
  const base = {
    snapshotAt: new Date().toISOString(),
    documentName: 'Test Document',
    pages: [{ id: 'p1', name: 'Page 1', type: 'PAGE', frames: [] }],
    variables: {
      'HDS Primitive': {
        id: 'var-coll-1',
        name: 'HDS Primitive',
        modes: [{ modeId: 'm1', name: 'Default' }],
        variables: [{ id: 'var-1', name: 'color/white', tokenPath: 'primitive.color.white', resolvedType: 'COLOR', valuesByMode: { m1: '#ffffff' } }]
      }
    },
    styles: { paint: [{ id: 's1', name: 'Surface', type: 'PAINT' }], text: [], effect: [], grid: [] },
    components: [{ id: 'c1', name: 'Button', type: 'COMPONENT_SET', variants: ['default', 'hover'], pageId: 'p1' }]
  };
  const modified = JSON.parse(JSON.stringify(base));
  modified.variables['HDS Semantic'] = { id: 'var-coll-2', name: 'HDS Semantic', modes: [{ modeId: 'm1', name: 'Default' }], variables: [{ id: 'var-2', name: 'color/surface', tokenPath: 'semantic.color.surface', resolvedType: 'COLOR', valuesByMode: { m1: '#f5f5f5' } }] };
  modified.styles.paint = [];
  modified.components.push({ id: 'c2', name: 'Input', type: 'COMPONENT_SET', variants: ['default', 'focus', 'error'], pageId: 'p1' });
  return [base, modified];
}

function categorizeKey(pointer) {
  if (pointer.includes('/variables/')) return 'variables';
  if (pointer.includes('/components/')) return 'components';
  if (pointer.includes('/styles/')) return 'styles';
  return 'other';
}

function compactValue(val) {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return val;
  if (Array.isArray(val)) return { summary: '<<array>>', length: val.length };
  if (typeof val === 'object') return { summary: '<<object>>', keys: Object.keys(val) };
  return val;
}

function computeDiff(oldSnap, newSnap) {
  const byCategory = {
    variables: { added: [], removed: [], changed: [] },
    components: { added: [], removed: [], changed: [] },
    styles: { added: [], removed: [], changed: [] },
    other: { added: [], removed: [], changed: [] }
  };

  function walk(oldObj, newObj, pointer = '') {
    const visited = new Set();
    if (oldObj && typeof oldObj === 'object' && !Array.isArray(oldObj)) {
      for (const key of Object.keys(oldObj)) {
        const newPointer = pointer ? `${pointer}/${key}` : `/${key}`;
        visited.add(key);
        const oldVal = oldObj[key];
        const newVal = newObj?.[key];
        if (newVal === undefined) {
          const cat = categorizeKey(newPointer);
          byCategory[cat].removed.push({ pointer: newPointer, value: compactValue(oldVal) });
        } else if (typeof oldVal === 'object' && typeof newVal === 'object' && !Array.isArray(oldVal) && !Array.isArray(newVal) && oldVal !== null && newVal !== null) {
          walk(oldVal, newVal, newPointer);
        } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          const cat = categorizeKey(newPointer);
          byCategory[cat].changed.push({ pointer: newPointer, before: compactValue(oldVal), after: compactValue(newVal) });
        }
      }
    }
    if (newObj && typeof newObj === 'object' && !Array.isArray(newObj)) {
      for (const key of Object.keys(newObj)) {
        if (!visited.has(key)) {
          const newPointer = pointer ? `${pointer}/${key}` : `/${key}`;
          const cat = categorizeKey(newPointer);
          byCategory[cat].added.push({ pointer: newPointer, value: compactValue(newObj[key]) });
        }
      }
    }
  }

  walk(oldSnap, newSnap);
  return byCategory;
}

function buildReport(fromSnap, toSnap) {
  const byCategory = computeDiff(fromSnap, toSnap);
  const summary = {
    addedCount: byCategory.variables.added.length + byCategory.components.added.length + byCategory.styles.added.length + byCategory.other.added.length,
    removedCount: byCategory.variables.removed.length + byCategory.components.removed.length + byCategory.styles.removed.length + byCategory.other.removed.length,
    changedCount: byCategory.variables.changed.length + byCategory.components.changed.length + byCategory.styles.changed.length + byCategory.other.changed.length
  };
  return { from: fromPath ? path.basename(fromPath) : 'synthetic', to: toPath ? path.basename(toPath) : 'synthetic', generatedAt: new Date().toISOString(), summary, byCategory };
}

let fromSnap, toSnap;
if (dryRun) {
  [fromSnap, toSnap] = createSyntheticSnapshots();
} else {
  fromSnap = loadSnapshot(fromPath);
  toSnap = loadSnapshot(toPath);
}

const report = buildReport(fromSnap, toSnap);
try {
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`✓ wrote ${outputPath} (${report.summary.addedCount} added, ${report.summary.removedCount} removed, ${report.summary.changedCount} changed)`);
  process.exit(0);
} catch (e) {
  console.error(`Error writing output: ${e.message}`);
  process.exit(1);
}
