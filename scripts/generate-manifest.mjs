#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * generate-manifest.mjs
 *
 * Keeps public/hds-manifest.json self-driving by recursively scanning the source
 * tree for governed HDS components and documentation utilities.
 *
 * Inputs category expanded 2026-05-10: controls.tsx @doc-exempt removed;
 * HdsSlider, HdsToggle, HdsRadio, HdsSelect now visible in public manifest.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { discoverHdsComponents } from './component-discovery.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MANIFEST_PATH = join(ROOT, 'public', 'hds-manifest.json');
const PATTERNS_DIR = join(ROOT, 'src', 'app', 'pages', 'hds', 'patterns');
const SRC_DIR = join(ROOT, 'src');
const DOCS_PAGE_SEGMENT = 'src/app/pages/hds/';

const COMPONENT_NAME_OVERRIDES = new Map([
  ['Alert', 'Alert'],
  ['Badge', 'Badge'],
  ['Card', 'Card'],
  ['CodeBlock', 'CodeBlock'],
  ['ControlsPanel', 'ControlsPanel'],
  ['Divider', 'Divider'],
  ['ExpandTooltip', 'Tooltip'],
  ['Icon', 'Icon'],
  ['Input', 'Input'],
  ['InlineCode', 'InlineCode'],
  ['InlineLink', 'InlineLink'],
  ['MorphCard', 'MorphCard'],
  ['Nav', 'HdsNav'],
  ['Stack', 'Stack'],
  ['StepperField', 'StepperField'],
  ['Tag', 'Tag'],
  ['Token', 'Token'],
]);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function collectTsxFiles(dir, base = '') {
  if (!dir || !existsSync(dir)) return [];
  const results = [];

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = base ? `${base}/${entry}` : entry;

    if (statSync(full).isDirectory()) {
      results.push(...collectTsxFiles(full, rel));
      continue;
    }

    if (entry.endsWith('.tsx')) {
      results.push(rel);
    }
  }

  return results;
}

function toPatternName(fileName) {
  return basename(fileName, '.tsx')
    .replace(/PatternPage$/, '')
    .replace(/Page$/, '');
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function getPreviewSizing(componentName) {
  switch (componentName) {
    case 'AnimatedLabel':
    case 'TextLockup':
    case 'HdsSidebarUtilityButton':
      return 'compact';
    case 'HdsComponentDoc':
    case 'FoundationSwatch':
    case 'Table':
    case 'ComponentInstanceMatrix':
    case 'InfoPage':
      return 'full';
    default:
      return 'panel';
  }
}

function toRelativePath(path) {
  return path.replace(`${ROOT}\\`, '').replace(`${ROOT}/`, '').replace(/\\/g, '/');
}

function collectSourceFiles(dir, base = '') {
  if (!existsSync(dir)) return [];

  const results = [];

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = base ? `${base}/${entry}` : entry;

    if (statSync(full).isDirectory()) {
      results.push(...collectSourceFiles(full, rel));
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.d.ts')) {
      results.push(rel);
    }
  }

  return results;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findConsumers(componentName, filePath, sourceFiles) {
  const pattern = new RegExp(`\\b${escapeRegex(componentName)}\\b`);

  return sourceFiles
    .filter((candidate) => candidate !== filePath)
    .filter((candidate) => !candidate.startsWith(DOCS_PAGE_SEGMENT))
    .filter((candidate) => {
      const content = readFileSync(join(ROOT, candidate), 'utf8');
      return pattern.test(content);
    })
    .sort((a, b) => a.localeCompare(b));
}

const manifest = readJson(MANIFEST_PATH);
const discovery = discoverHdsComponents();
const discoveredComponents = discovery.components;
const namespaceViolations = discovery.namespaceViolations;
const activeDiscoveredComponents = discoveredComponents.filter((entry) => !entry.ignored);
const sourceFiles = collectSourceFiles(SRC_DIR).map((file) => toRelativePath(join(SRC_DIR, file)));
const discoveredPatterns = collectTsxFiles(PATTERNS_DIR)
  .map((file) => toPatternName(file))
  .filter(Boolean);

// INVENTORY_TIERS must match generate-component-api.mjs exactly so that
// componentInventory ↔ component-api.json stay in sync (pnpm figma:audit).
// template-tier components are excluded here because they are not parsed by
// react-docgen-typescript in the API generator.
const INVENTORY_TIERS = new Set(['primitive', 'pattern']);
const _PUBLIC_API_TIERS = new Set(['primitive', 'pattern', 'template']);
const SECTION_BY_TIER = { utility: 'utilities' };

const componentInventory = uniqueSorted(
  activeDiscoveredComponents
    .filter((entry) => entry.tier && INVENTORY_TIERS.has(entry.tier))
    .map((entry) => entry.name),
);
const patternInventory = uniqueSorted(discoveredPatterns);

// Fold utilities back into the working set so the discovery loop preserves
// their spec data across runs. The move-pass at the bottom redistributes
// by tier. Without this, source-less specs in utilities vanish on the
// second run because the discovery lookup only consults componentSpecs.
const seedSpecs = {
  ...(manifest.componentSpecs ?? {}),
  ...(manifest.utilities ?? {}),
};

const remappedSpecs = {};
for (const [componentName, spec] of Object.entries(seedSpecs)) {
  const nextName = COMPONENT_NAME_OVERRIDES.get(componentName) ?? componentName;
  remappedSpecs[nextName] = {
    ...spec,
    description:
      typeof spec?.description === 'string'
        ? spec.description.replaceAll(componentName, nextName)
        : spec?.description,
  };
}

manifest.componentInventory = componentInventory;
manifest.patternInventory = patternInventory;
manifest.componentSpecs = remappedSpecs;
manifest.inventory = manifest.inventory ?? {};

for (const entry of activeDiscoveredComponents) {
  const current = manifest.componentSpecs[entry.name] ?? {};

  let category = current.category ?? 'Uncategorized';
  let categorySource =
    current.categorySource ?? (current.category ? 'legacy-manifest' : 'missing-jsdoc');
  let hidden = Boolean(current.hidden);

  if (entry.hidden) {
    category = current.category ?? 'Internal';
    categorySource = 'internal-jsdoc';
    hidden = true;
  } else if (entry.category) {
    category = entry.category;
    categorySource = 'jsdoc';
    hidden = false;
  } else {
    category = 'Uncategorized';
    categorySource = 'missing-jsdoc';
    hidden = false;
  }

  manifest.componentSpecs[entry.name] = {
    ...current,
    category,
    categorySource,
    governedCategory: categorySource === 'jsdoc' || categorySource === 'internal-jsdoc',
    hidden,
    docExempt: entry.docExempt,
    filePath: entry.filePath,
    description: entry.description || current.description,
    figmaUrl: entry.figmaUrl ?? current.figmaUrl ?? null,
    figmaId: current.figmaId ?? (entry.name === 'TextLockup' ? 'text-lockup-pattern' : null),
    // figmaLink: explicit "View in Figma" target surfaced on the doc-page
    // header. Mirrors figmaUrl when populated; otherwise a structured
    // `TODO:hds-master:<componentName>` marker so the link slot can render
    // a "TODO" affordance and the figmaLink populated count stays at 100%
    // for every non-template componentSpec. Templates may stay null. (10d-14)
    figmaLink:
      current.figmaLink ??
      entry.figmaUrl ??
      current.figmaUrl ??
      (current.tier === 'template' ? null : `TODO:hds-master:${entry.name}`),
    // doc-exempt components surfacing for the first time fall back to 'utility' —
    // they're hidden internal helpers, so utility is the safe default until a
    // human authors a more precise @tier in the JSDoc.
    tier: entry.tier ?? current.tier ?? (entry.docExempt ? 'utility' : null),
    preview: {
      ...(current.preview ?? {}),
      exportName: entry.name,
      sizing: getPreviewSizing(entry.name),
    },
    consumers: findConsumers(entry.name, entry.filePath, sourceFiles),
    tokenMapping: current.tokenMapping ?? {},
    variantAxes: current.variantAxes ?? [],
    componentProperties: current.componentProperties ?? [],
  };
}

for (const entry of discoveredComponents.filter((component) => component.ignored)) {
  delete manifest.componentSpecs[entry.name];
}

// Prune orphans: spec entries whose recorded filePath no longer exists on
// disk. The seed-fold above preserves manually-authored metadata across
// regens, but it also keeps ghosts from deleted components alive (see the
// HdsNav fallout after 8x-4 / GENERATIVE_SUBSET trim). We only prune when
// we can prove the source is gone — entries lacking filePath stay put so
// loosely-tagged real components (e.g. doc pages without an @category tag,
// which discovery doesn't surface) aren't accidentally swept.
for (const [name, spec] of Object.entries(manifest.componentSpecs)) {
  const filePath = spec?.filePath;
  if (typeof filePath === 'string' && filePath && !existsSync(join(ROOT, filePath))) {
    delete manifest.componentSpecs[name];
  }
}

const utilities = {};
for (const [name, spec] of Object.entries(manifest.componentSpecs)) {
  if (SECTION_BY_TIER[spec.tier] === 'utilities') {
    utilities[name] = spec;
    delete manifest.componentSpecs[name];
  }
}
manifest.utilities = utilities;
delete manifest.experiments;

manifest.inventory.uncategorized = activeDiscoveredComponents
  .filter((entry) => !entry.hidden && !entry.category && !entry.docExempt)
  .map((entry) => ({
    name: entry.name,
    filePath: entry.filePath,
  }))
  .sort((a, b) => a.name.localeCompare(b.name) || a.filePath.localeCompare(b.filePath));

manifest.inventory.namespaceViolations = namespaceViolations;

writeJson(MANIFEST_PATH, manifest);

const componentSpecCount = Object.keys(manifest.componentSpecs).length;
const utilityCount = Object.keys(utilities).length;
const sections = [`${componentSpecCount} components`];
if (utilityCount > 0) sections.push(`${utilityCount} utilities`);
console.log(`OK public/hds-manifest.json (${sections.join(', ')})`);

// Auto-regenerate lean agent projection
const { execSync } = await import('child_process');
try {
  execSync('node scripts/generate-manifest-projection.mjs', { stdio: 'inherit', cwd: ROOT });
} catch {
  // Non-fatal — projection is a cost-opt artifact
}
