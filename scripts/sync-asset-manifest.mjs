/** @internal — not part of @hirobius/design-system public API surface. */
import { existsSync, readFileSync } from 'node:fs';
import { readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const ASSETS_DIR = path.join(ROOT, 'public', 'assets');
const MANIFEST_PATH = path.join(ASSETS_DIR, 'manifest.json');

const IGNORED_FILES = new Set(['README.md', 'manifest.json']);

const KIND_BY_EXTENSION = new Map([
  ['.png', 'image'],
  ['.jpg', 'image'],
  ['.jpeg', 'image'],
  ['.webp', 'image'],
  ['.gif', 'image'],
  ['.svg', 'vector'],
  ['.avif', 'image'],
  ['.mp4', 'video'],
  ['.webm', 'video'],
  ['.mov', 'video'],
  ['.pdf', 'document'],
]);

const ACRONYMS = new Map([
  ['mds', 'MDS'],
  ['xds', 'XDS'],
  ['xdl', 'XDL'],
  ['hds', 'HDS'],
  ['mgd', 'MGD'],
  ['ui', 'UI'],
  ['ai', 'AI'],
  ['fg', 'FG'],
  ['mg', 'MG'],
  ['bg', 'BG'],
]);

function normalizeSlashes(value) {
  return value.replace(/\\/g, '/');
}

function titleCaseWord(word) {
  const lower = word.toLowerCase();

  if (ACRONYMS.has(lower)) {
    return ACRONYMS.get(lower);
  }

  if (/^\d+$/.test(word)) {
    return word;
  }

  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function humanizeSegment(segment) {
  return segment
    .replace(/\.[^.]+$/, '')
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map(titleCaseWord)
    .join(' ');
}

function buildFallbackAlt(assetPath, kind) {
  const segments = assetPath.replace(/^\/assets\//, '').split('/');

  if (segments[0] === '_archive') {
    return `Archived ${segments.slice(1).map(humanizeSegment).join(' ')} ${kind}`;
  }

  if (segments[0] === '_incoming') {
    return `Incoming ${segments.slice(1).map(humanizeSegment).join(' ')} ${kind}`;
  }

  return `${segments.map(humanizeSegment).join(' ')} ${kind}`;
}

function deriveStatus(assetPath) {
  if (assetPath.startsWith('/assets/_archive/')) {
    return 'archived';
  }

  if (assetPath.startsWith('/assets/_incoming/')) {
    return 'ready';
  }

  return 'published';
}

function loadExistingManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    return new Map();
  }

  const parsed = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const assets = Array.isArray(parsed?.assets) ? parsed.assets : [];
  return new Map(
    assets
      .filter((entry) => entry && typeof entry.path === 'string')
      .map((entry) => [entry.path, entry]),
  );
}

async function walkAssetFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkAssetFiles(fullPath)));
      continue;
    }

    if (IGNORED_FILES.has(entry.name)) {
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!KIND_BY_EXTENSION.has(ext)) {
      continue;
    }

    const fileStat = await stat(fullPath);
    if (!fileStat.isFile()) {
      continue;
    }

    const relativePath = normalizeSlashes(path.relative(path.join(ROOT, 'public'), fullPath));
    files.push(`/${relativePath}`);
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function buildManifestEntry(assetPath, existingEntries) {
  const existing = existingEntries.get(assetPath) ?? {};
  const ext = path.extname(assetPath).toLowerCase();
  const kind = typeof existing.kind === 'string' ? existing.kind : KIND_BY_EXTENSION.get(ext) ?? 'other';
  const decorative = existing.decorative === true;

  const entry = {
    path: assetPath,
    kind,
    alt:
      typeof existing.alt === 'string'
        ? existing.alt
        : decorative
          ? ''
          : buildFallbackAlt(assetPath, kind),
    status: typeof existing.status === 'string' ? existing.status : deriveStatus(assetPath),
    reviewed: typeof existing.reviewed === 'boolean' ? existing.reviewed : true,
  };

  if (decorative) {
    entry.decorative = true;
  }

  if (typeof existing.sourceId === 'string' && existing.sourceId.trim().length > 0) {
    entry.sourceId = existing.sourceId;
  }

  return entry;
}

async function main() {
  const existingEntries = loadExistingManifest();
  const assetPaths = await walkAssetFiles(ASSETS_DIR);
  const manifest = {
    assets: assetPaths.map((assetPath) => buildManifestEntry(assetPath, existingEntries)),
  };

  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Synced asset manifest with ${manifest.assets.length} asset entries.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
