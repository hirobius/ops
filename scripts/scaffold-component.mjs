#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/scaffold-component.mjs
 *
 * Creates a Swiss-canonical component skeleton from
 * templates/component-template.tsx, plus a manifest stub and a fixture
 * stub under fixtures/swiss-canon/<name>-clean/. The scaffolder makes
 * the canon path the easy path — Adrian or any agent runs:
 *
 *   pnpm scaffold:component HdsExample
 *   pnpm scaffold:component HdsExample --dry-run
 *
 * --dry-run prints the planned writes without touching disk; this is what
 * the unit's validationCmd uses so it can run safely in CI.
 *
 * Manifest mutation is atomic — read once, mutate in memory, write once.
 * Component name must be PascalCase and start with `Hds` (or whatever the
 * project prefix is at the time — this script reads STRUCTURAL_COMPONENTS
 * from validators/canon-rules.mjs to validate against the current canon).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_PATH = path.join(ROOT, 'templates/component-template.tsx');
const COMPONENT_DIR = path.join(ROOT, 'src/app/components');
const MANIFEST_PATH = path.join(ROOT, 'public/hds-manifest.json');
const FIXTURE_ROOT = path.join(ROOT, 'fixtures/swiss-canon');

function usage() {
  console.error('Usage: pnpm scaffold:component <PascalCaseName> [--dry-run]');
  console.error('  Component name must be PascalCase, prefixed with Hds');
  console.error('  e.g. pnpm scaffold:component HdsExample');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const positional = args.filter((a) => !a.startsWith('--'));
  return { name: positional[0], dryRun };
}

function validateName(name) {
  if (!name) return 'name required';
  if (!/^_*[A-Z][A-Za-z0-9]+$/.test(name)) {
    return 'name must be PascalCase (e.g. HdsExample). Leading underscores allowed for sandbox/dry-run names.';
  }
  const stripped = name.replace(/^_+/, '');
  if (!stripped.startsWith('Hds')) {
    return 'name must start with the Hds prefix';
  }
  return null;
}

function kebabCase(name) {
  return name.replace(/^_+/, '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function buildSpecStub(name) {
  return {
    category: 'Component',
    filePath: `src/app/components/${name}.tsx`,
    description: `${name} — Swiss-canonical component scaffold. Body emphasis is font-medium (500), never bold. Color hierarchy uses opacity on a single hue (semantic.color.content.primary/secondary/tertiary), never a second hue. Spacing on the 8px grid only.`,
    hidden: false,
    props: {
      variant: { type: 'enum', values: ['primary', 'secondary', 'tertiary'], default: 'primary' },
    },
    propConstraints: {
      variant: { type: 'enum', values: ['primary', 'secondary', 'tertiary'] },
    },
    requiredProps: [],
    a11yRules: [],
    allowedChildren: ['*'],
    preview: { exportName: name, sizing: 'panel' },
    tokenMapping: {},
  };
}

function fixtureInputJsx(name) {
  return `<${name} variant="primary" />\n`;
}

const FIXTURE_EXPECTED = {
  ok: true,
  errors: [],
};

function plan(name) {
  const componentPath = path.join(COMPONENT_DIR, `${name}.tsx`);
  const fixtureDir = path.join(FIXTURE_ROOT, `${kebabCase(name)}-clean`);
  const fixtureInputPath = path.join(fixtureDir, 'input.jsx');
  const fixtureExpectedPath = path.join(fixtureDir, 'expected.json');
  return { componentPath, fixtureDir, fixtureInputPath, fixtureExpectedPath };
}

function readManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function writeManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
}

function buildComponentSource(name) {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  return template.replace(/__NAME__/g, name);
}

function main() {
  const { name, dryRun } = parseArgs(process.argv);
  const err = validateName(name);
  if (err) {
    console.error('Error:', err);
    usage();
    process.exit(1);
  }

  const paths = plan(name);
  const componentSource = buildComponentSource(name);
  const manifest = readManifest();

  if (manifest.componentSpecs?.[name]) {
    console.error(`Error: componentSpecs["${name}"] already exists in manifest. Pick a different name or update by hand.`);
    process.exit(1);
  }
  if (fs.existsSync(paths.componentPath)) {
    console.error(`Error: ${paths.componentPath} already exists.`);
    process.exit(1);
  }

  const spec = buildSpecStub(name);

  if (dryRun) {
    console.log('[dry-run] would write:', paths.componentPath);
    console.log('[dry-run]   bytes:', componentSource.length);
    console.log('[dry-run] would add manifest entry:', name);
    console.log('[dry-run]   description length:', spec.description.length);
    console.log('[dry-run] would write fixture:', paths.fixtureInputPath);
    console.log('[dry-run] would write fixture:', paths.fixtureExpectedPath);
    return;
  }

  fs.writeFileSync(paths.componentPath, componentSource);
  console.log('wrote', paths.componentPath);

  manifest.componentSpecs = manifest.componentSpecs || {};
  manifest.componentSpecs[name] = spec;
  writeManifest(manifest);
  console.log('updated manifest with', name);

  fs.mkdirSync(paths.fixtureDir, { recursive: true });
  fs.writeFileSync(paths.fixtureInputPath, fixtureInputJsx(name));
  fs.writeFileSync(paths.fixtureExpectedPath, JSON.stringify(FIXTURE_EXPECTED, null, 2) + '\n');
  console.log('wrote fixture', paths.fixtureDir);

  console.log('\nNext steps:');
  console.log('  1. Edit', paths.componentPath, '— flesh out variant logic');
  console.log('  2. Run node scripts/run-validator-tests.mjs --filter=swiss-canon');
  console.log('  3. Run node scripts/check-component-completeness.mjs');
}

main();
