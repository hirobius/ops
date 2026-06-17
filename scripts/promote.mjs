#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const COMPONENTS_DIR = path.join(ROOT, 'src/app/components');
const LAB_SEARCH_DIRS = [
  path.join(ROOT, 'src/app/pages/lab/incubator'),
  path.join(ROOT, 'src/app/pages/lab'),
  path.join(ROOT, 'src/app/pages/hds'),
];
const SOURCE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];
const FORWARD_REF_RE = /React\s*\.\s*forwardRef\b/s;

function usage() {
  return [
    'Usage: pnpm promote <ComponentName>',
    'Example: pnpm promote HdsNewCard',
  ].join('\n');
}

function normalizeName(rawName) {
  return rawName?.trim().replace(/\.(t|j)sx?$/i, '') ?? '';
}

async function findSourceFile(componentName) {
  for (const searchDir of LAB_SEARCH_DIRS) {
    for (const extension of SOURCE_EXTENSIONS) {
      const candidate = path.join(searchDir, `${componentName}${extension}`);
      if (existsSync(candidate)) {
        const candidateStat = await stat(candidate);
        if (candidateStat.isFile()) {
          return candidate;
        }
      }
    }
  }

  return null;
}

async function main() {
  const componentName = normalizeName(process.argv[2]);

  if (!componentName) {
    console.error(usage());
    process.exit(1);
  }

  const sourcePath = await findSourceFile(componentName);
  if (!sourcePath) {
    console.error(
      [
        `Unable to find "${componentName}" in the lab promotion paths.`,
        'Checked:',
        ...LAB_SEARCH_DIRS.map((dir) => `- ${path.relative(ROOT, dir)}`),
      ].join('\n'),
    );
    process.exit(1);
  }

  const sourceCode = await readFile(sourcePath, 'utf8');
  if (!FORWARD_REF_RE.test(sourceCode)) {
    console.error(
      [
        `Promotion aborted for "${componentName}".`,
        'Add polymorphism before promotion: wrap the component in React.forwardRef(...) in the lab file first.',
      ].join('\n'),
    );
    process.exit(1);
  }

  const destinationPath = path.join(COMPONENTS_DIR, path.basename(sourcePath));
  if (existsSync(destinationPath)) {
    console.error(
      `Promotion aborted: ${path.relative(ROOT, destinationPath)} already exists.`,
    );
    process.exit(1);
  }

  await mkdir(COMPONENTS_DIR, { recursive: true });
  await rename(sourcePath, destinationPath);

  console.log(
    [
      `Promoted "${componentName}".`,
      `From: ${path.relative(ROOT, sourcePath)}`,
      `To:   ${path.relative(ROOT, destinationPath)}`,
    ].join('\n'),
  );
}

main().catch((error) => {
  console.error('Promotion failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
