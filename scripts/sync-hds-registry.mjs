#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * sync-hds-registry.mjs
 *
 * Keeps src/app/data/hds-registry.json in sync with the actual HDS page files.
 *
 * On every run:
 *   1. Scans src/app/pages/hds/ for page files (*.tsx)
 *   2. Skips known non-doc files (layout, context, embedded sub-components)
 *   3. Derives the expected route path from the filename
 *   4. Adds a stub registry entry for any page that has no entry yet
 *   5. Removes entries whose path no longer has a matching page file (optional — see PRUNE)
 *
 * Stub entries are marked with "summary": "TODO: ..." so check:registry can flag them.
 *
 * Auto-runs as part of `pnpm tokens`. Also safe to run standalone:
 *   node scripts/sync-hds-registry.mjs
 *   node scripts/sync-hds-registry.mjs --prune   # also remove orphaned entries
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const PAGES_DIR = join(ROOT, 'src', 'app', 'pages', 'hds');
const REGISTRY  = join(ROOT, 'src', 'app', 'data', 'hds-registry.json');

const PRUNE = process.argv.includes('--prune');

// ── Files that are NOT standalone doc pages ───────────────────────────────────
// Layout shells, contexts, embedded sub-components, and non-HDS pages.
const EXCLUDE = new Set([
  'HDSLayout.tsx',
  'HdsDocPrimitives.tsx',
  'HdsTocContext.tsx',
  'IconGallery.tsx',
  'GettingStartedPage.tsx',
  'TokenCascadeDiagram.tsx',
  'TokenExplorerPanel.tsx',
  'HirobiusCaseStudyPage.tsx',
  'PrimaryCaseStudyPage.tsx',
  'PortfolioHomePage.tsx',
]);

// ── Path overrides ────────────────────────────────────────────────────────────
// Files whose derived path doesn't match the actual route.
// Key: relative file path from PAGES_DIR  Value: actual route path
const PATH_OVERRIDES = {
  'OverviewPage.tsx': '/hds',
  'ShapePage.tsx': '/hds/shape',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Converts PascalCase to kebab-case. "GettingStarted" → "getting-started". */
function toKebab(str) {
  return str
    .replace(/([A-Z])/g, m => `-${m.toLowerCase()}`)
    .replace(/^-/, '');
}

/** Derives the route path from a page file's path relative to PAGES_DIR. */
function derivePath(relFile) {
  if (PATH_OVERRIDES[relFile]) return PATH_OVERRIDES[relFile];
  // Strip .tsx, strip trailing "Page" suffix
  const name = basename(relFile, '.tsx').replace(/Page$/, '');
  const slug = toKebab(name);
  const dir  = dirname(relFile);
  if (dir === '.' || dir === '') return `/hds/${slug}`;
  // e.g. "components/Actions" → /hds/components/actions
  return `/hds/${dir}/${slug}`;
}

/** Derives a human-readable page name from the file path. */
function deriveName(relFile) {
  return basename(relFile, '.tsx').replace(/Page$/, '');
}

/** Derives the category from the file's directory. */
function deriveCategory(relFile) {
  const dir = dirname(relFile);
  if (dir.startsWith('components')) return 'components';
  return 'foundations';
}

/** Recursively collects all .tsx files under a directory. */
function collectTsx(dir, base = '') {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel  = base ? `${base}/${entry}` : entry;
    if (statSync(full).isDirectory()) {
      results.push(...collectTsx(full, rel));
    } else if (entry.endsWith('.tsx')) {
      results.push(rel);
    }
  }
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const registry  = JSON.parse(readFileSync(REGISTRY, 'utf8'));
const allFiles  = collectTsx(PAGES_DIR);
const pageFiles = allFiles.filter(f => !EXCLUDE.has(basename(f)));

const registryPaths = new Set(registry.map(e => e.path));

// ── 1. Add stubs for pages missing from registry ──────────────────────────────

let added = 0;
for (const relFile of pageFiles) {
  const path = derivePath(relFile);
  if (registryPaths.has(path)) continue;

  const stub = {
    page:     deriveName(relFile),
    path,
    category: deriveCategory(relFile),
    summary:  `TODO: Add a summary for the ${deriveName(relFile)} page.`,
  };

  // Insert in alphabetical path order for readability
  const insertIdx = registry.findIndex(e => e.path > path);
  if (insertIdx === -1) registry.push(stub);
  else registry.splice(insertIdx, 0, stub);

  console.log(`  + added stub: ${path}  (${relFile})`);
  added++;
}

// ── 2. Optionally remove entries with no matching page file ───────────────────

let removed = 0;
if (PRUNE) {
  const derivedPaths = new Set(pageFiles.map(derivePath));
  const before = registry.length;
  const pruned = registry.filter(e => derivedPaths.has(e.path));
  removed = before - pruned.length;
  if (removed > 0) {
    pruned.forEach((e) => {
      if (!derivedPaths.has(e.path)) console.log(`  - removed orphan: ${e.path}`);
    });
    registry.splice(0, registry.length, ...pruned);
  }
}

// ── 3. Write ──────────────────────────────────────────────────────────────────

if (added > 0 || removed > 0) {
  writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + '\n');
  console.log(`✓ hds-registry.json: +${added} added, -${removed} removed (${registry.length} total)`);
} else {
  console.log('✓ hds-registry.json: already in sync');
}
