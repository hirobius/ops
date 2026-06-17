/** @internal — not part of @hirobius/design-system public API surface. */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, 'public', 'hds-manifest.json');
const compilerPath = path.join(repoRoot, 'scripts', 'hds-jsx-compiler.mjs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function extractSetNames(source, setName) {
  const pattern = new RegExp(`const\\s+${setName}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\);`);
  const match = source.match(pattern);

  if (!match) {
    return [];
  }

  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}

const manifest = readJson(manifestPath);
const compilerSource = fs.readFileSync(compilerPath, 'utf8');
const knownNames = new Set([
  ...Object.keys(manifest.componentSpecs ?? {}),
  ...Object.keys(manifest.utilities ?? {}),
]);
const compilerNames = new Set([
  ...extractSetNames(compilerSource, 'FRAME_TAGS'),
  ...extractSetNames(compilerSource, 'TEXT_TAGS'),
  ...extractSetNames(compilerSource, 'INSTANCE_TAGS'),
  ...extractSetNames(compilerSource, 'ICON_TAGS'),
].filter((name) => /^Hds[A-Z]/.test(name)));

let warnings = 0;

for (const name of compilerNames) {
  if (!knownNames.has(name)) {
    console.warn(`⚠ Compiler references ${name} but it is absent from componentSpecs/utilities`);
    warnings += 1;
  }
}

process.exit(warnings > 0 ? 1 : 0);
