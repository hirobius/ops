#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * sync-icons.mjs
 *
 * Scans src/ for lucide-react imports and emits a registry of the
 * icon exports currently used by the app.
 *
 * Output:
 *   src/app/data/used-icons.json
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC_DIR = join(ROOT, 'src');
const OUTPUT_FILE = join(ROOT, 'src', 'app', 'data', 'used-icons.json');

const IMPORT_RE = /^\s*import\s+\{([^}]*)\}\s+from\s+['"]lucide-react['"];?/gm;

function collectFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      files.push(...collectFiles(full));
    } else if (/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function cleanName(name) {
  return name
    .replace(/^type\s+/, '')
    .replace(/\s+as\s+.*$/, '')
    .trim();
}

function parseSpecifiers(block) {
  return block
    .split(',')
    .map(spec => cleanName(spec))
    .filter(Boolean);
}

function buildRegistry() {
  const usageMap = new Map();

  for (const file of collectFiles(SRC_DIR)) {
    const relFile = relative(ROOT, file).replace(/\\/g, '/');
    const text = readFileSync(file, 'utf8');
    IMPORT_RE.lastIndex = 0;
    let match;

    while ((match = IMPORT_RE.exec(text))) {
      const names = parseSpecifiers(match[1]);
      for (const name of names) {
        if (!usageMap.has(name)) {
          usageMap.set(name, { name, count: 0, files: new Set() });
        }
        const entry = usageMap.get(name);
        entry.count += 1;
        entry.files.add(relFile);
      }
    }
  }

  const icons = [...usageMap.values()]
    .map(entry => ({
      name: entry.name,
      count: entry.count,
      files: [...entry.files].sort(),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return {
    generatedAt: new Date().toISOString(),
    source: 'src',
    totalReferences: icons.reduce((sum, item) => sum + item.count, 0),
    icons,
  };
}

function main() {
  const registry = buildRegistry();
  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(registry, null, 2)}\n`);
  console.log(`Generated ${OUTPUT_FILE}`);
}

main();
