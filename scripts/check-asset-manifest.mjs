/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-asset-manifest.mjs
 *
 * Guards the asset layer before large-scale visual population begins.
 *
 * Checks:
 *   1. Every real file in public/assets has a manifest entry.
 *   2. Every manifest entry uses normalized /assets/... paths and valid metadata.
 *   3. Image-like assets require meaningful alt text unless explicitly decorative.
 *   4. Planned assets may exist in the manifest before files land, but non-planned
 *      entries must map to a real file.
 *   5. Portfolio data entries in projects.ts must include nearby alt text.
 *
 * Usage: pnpm check:assets
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.cwd();
const ASSETS_DIR = join(ROOT, 'public/assets');
const MANIFEST_PATH = join(ASSETS_DIR, 'manifest.json');
const PROJECT_DATA_PATH = join(ROOT, 'src/app/data/projects.ts');

const ASSET_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.svg',
  '.avif',
  '.mp4',
  '.webm',
  '.mov',
  '.pdf',
]);

const IMAGE_LIKE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.svg',
  '.avif',
]);

const ALLOWED_KINDS = new Set(['image', 'video', 'vector', 'document', 'other']);
const ALLOWED_STATUS = new Set(['planned', 'ready', 'published', 'archived']);
const IGNORED_FILES = new Set(['README.md', 'manifest.json']);

function normalizeSlashes(value) {
  return value.replace(/\\/g, '/');
}

function extname(file) {
  const idx = file.lastIndexOf('.');
  return idx >= 0 ? file.slice(idx).toLowerCase() : '';
}

function getAssetFiles(dir) {
  const results = [];

  if (!existsSync(dir)) return results;

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);

    if (stat.isDirectory()) {
      results.push(...getAssetFiles(full));
      continue;
    }

    if (IGNORED_FILES.has(entry)) continue;
    if (!ASSET_EXTENSIONS.has(extname(entry))) continue;

    const rel = normalizeSlashes(relative(join(ROOT, 'public'), full));
    results.push(`/${rel}`);
  }

  return results.sort();
}

function fail(message, details = []) {
  console.error(`\n✗ Asset manifest check failed — ${message}\n`);
  for (const detail of details) {
    console.error(`  ${detail}`);
  }
  console.error('');
  process.exit(1);
}

if (!existsSync(MANIFEST_PATH)) {
  fail('public/assets/manifest.json is missing.', [
    'Create the manifest before adding production assets.',
  ]);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

if (!manifest || !Array.isArray(manifest.assets)) {
  fail('public/assets/manifest.json must export an object with an assets array.');
}

const realFiles = new Set(getAssetFiles(ASSETS_DIR));
const manifestByPath = new Map();
const violations = [];

for (const entry of manifest.assets) {
  if (!entry || typeof entry !== 'object') {
    violations.push('manifest contains a non-object asset entry');
    continue;
  }

  const { path, kind, alt, decorative = false, reviewed, status, sourceId } = entry;

  if (typeof path !== 'string' || !path.startsWith('/assets/')) {
    violations.push(`invalid path: ${String(path)}`);
    continue;
  }

  if (manifestByPath.has(path)) {
    violations.push(`duplicate manifest path: ${path}`);
    continue;
  }

  if (!ALLOWED_KINDS.has(kind)) {
    violations.push(`invalid kind for ${path}: ${String(kind)}`);
  }

  if (!ALLOWED_STATUS.has(status)) {
    violations.push(`invalid status for ${path}: ${String(status)}`);
  }

  if (typeof reviewed !== 'boolean') {
    violations.push(`reviewed must be boolean for ${path}`);
  }

  if (sourceId != null && typeof sourceId !== 'string') {
    violations.push(`sourceId must be a string when present for ${path}`);
  }

  const requiresAlt = IMAGE_LIKE_EXTENSIONS.has(extname(path)) || kind === 'image' || kind === 'vector';
  if (requiresAlt && !decorative) {
    if (typeof alt !== 'string' || alt.trim().length < 8) {
      violations.push(`alt text missing or too short for ${path}`);
    }
  }

  if (decorative && typeof alt !== 'string') {
    violations.push(`decorative assets must still include alt for ${path} (use an empty string)`);
  }

  if (status !== 'planned' && !realFiles.has(path)) {
    violations.push(`manifest entry does not map to a real file: ${path}`);
  }

  manifestByPath.set(path, entry);
}

for (const filePath of realFiles) {
  if (!manifestByPath.has(filePath)) {
    violations.push(`real asset missing from manifest: ${filePath}`);
  }
}

if (existsSync(PROJECT_DATA_PATH)) {
  const lines = readFileSync(PROJECT_DATA_PATH, 'utf8').split('\n');
  const srcPattern = /src:\s*'?(\/assets\/[^'`,]+)'?/;
  const altPattern = /alt:\s*'([^']+)'|alt:\s*"([^"]+)"/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const srcMatch = line.match(srcPattern);
    if (!srcMatch) continue;

    const window = lines.slice(i, Math.min(i + 8, lines.length)).join('\n');
    const altMatch = window.match(altPattern);
    if (!altMatch) {
      violations.push(`projects.ts asset is missing nearby alt text: ${srcMatch[1]} (line ${i + 1})`);
      continue;
    }

    const altText = (altMatch[1] ?? altMatch[2] ?? '').trim();
    if (altText.length < 3) {
      violations.push(`projects.ts asset alt text is too short: ${srcMatch[1]} (line ${i + 1})`);
    }
  }
}

if (violations.length > 0) {
  fail('asset metadata drift detected.', violations);
}

console.log('\n✓ Asset manifest check passed — asset files, metadata, and portfolio alt coverage are in sync.\n');
