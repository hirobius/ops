#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-registry.mjs
 *
 * Validates that hds-registry.json is complete and up-to-date.
 *
 * Checks:
 *   1. No stub summaries (entries with "TODO:" in their summary field)
 *   2. No page files are missing a registry entry
 *
 * Run: node scripts/check-registry.mjs
 * Or:  pnpm check:registry
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REGISTRY = join(ROOT, 'src', 'app', 'data', 'hds-registry.json');
const PAGES_DIR = join(ROOT, 'src', 'app', 'pages', 'hds');

const EXCLUDE = new Set([
  'HDSLayout.tsx',
  'HdsDocPrimitives.tsx',
  'HdsTocContext.tsx',
  'IconGallery.tsx',
  'GettingStartedPage.tsx',
  'TokenCascadeDiagram.tsx',
  'TokenExplorerPanel.tsx',
  'HirobiusCaseStudyPage.tsx',
  'RanchFoundationCaseStudyPage.tsx',
  'PrimaryCaseStudyPage.tsx',
  'PortfolioHomePage.tsx',
]);

const PATH_OVERRIDES = {
  'OverviewPage.tsx': '/hds',
};

function toKebab(str) {
  return str.replace(/([A-Z])/g, (match) => `-${match.toLowerCase()}`).replace(/^-/, '');
}

function derivePath(relFile) {
  if (PATH_OVERRIDES[relFile]) return PATH_OVERRIDES[relFile];
  const name = basename(relFile, '.tsx').replace(/Page$/, '');
  const slug = toKebab(name);
  const dir =
    basename(relFile, '.tsx') === relFile.split('/')[0]
      ? ''
      : relFile.split('/').slice(0, -1).join('/');

  if (!dir || dir === '.') return `/hds/${slug}`;
  return `/hds/${dir}/${slug}`;
}

function collectTsx(dir, base = '') {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = base ? `${base}/${entry}` : entry;
    if (statSync(full).isDirectory()) results.push(...collectTsx(full, rel));
    else if (entry.endsWith('.tsx') && !entry.endsWith('.test.tsx')) results.push(rel);
  }
  return results;
}

export function runRegistryCheck() {
  const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  const errors = [];

  for (const entry of registry) {
    if (entry.summary?.startsWith('TODO:')) {
      errors.push(`stub summary: ${entry.path} - fill in summary in hds-registry.json`);
    }
  }

  const pageFiles = collectTsx(PAGES_DIR).filter((file) => !EXCLUDE.has(basename(file)));
  const registryPaths = new Set(registry.map((entry) => entry.path));
  for (const relFile of pageFiles) {
    const path = derivePath(relFile);
    if (!registryPaths.has(path)) {
      errors.push(`missing entry: ${path} (${relFile}) - run pnpm tokens to add stub`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    registryCount: registry.length,
  };
}

export function main() {
  const result = runRegistryCheck();
  if (!result.ok) {
    console.error(`FAIL check:registry - ${result.errors.length} issue(s):`);
    result.errors.forEach((error) => console.error(`  ${error}`));
    process.exit(1);
  }
  console.log(`OK check:registry - ${result.registryCount} entries, all complete`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
