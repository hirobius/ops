#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-frozen-demos.mjs
 *
 * Guardrail for docs preview surfaces.
 *
 * Consumer component docs pages should not hand-author bespoke preview demos;
 * those previews must stay default-state driven and inherit their specimen
 * shape from the component renderer itself. Any intentional state coverage
 * should live in matrices / frozen specimens, not one-off preview panes.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const TARGET_FILES = [
  join(ROOT, 'src/app/pages/hds/components/ActionsPage.tsx'),
  join(ROOT, 'src/app/pages/hds/components/InputsPage.tsx'),
  join(ROOT, 'src/app/pages/hds/components/LayoutPage.tsx'),
];

function readText(path) {
  return readFileSync(path, 'utf8');
}

function findDemoLines(text) {
  return text
    .split('\n')
    .map((line, index) => ({ line, index: index + 1 }))
    .filter(({ line }) => /\bdemo:\s*</.test(line) || /\bdemo:\s*\(/.test(line));
}

const offenders = [];

for (const file of TARGET_FILES) {
  const text = readText(file);
  const demoLines = findDemoLines(text);
  if (demoLines.length > 0) {
    offenders.push({
      file,
      lines: demoLines.map(({ index, line }) => `${index}: ${line.trim()}`),
    });
  }
}

if (offenders.length === 0) {
  console.log('Frozen demo check passed: consumer preview pages only use default-state specimens and matrices.');
  process.exit(0);
}

console.error('Frozen demo check failed: bespoke preview demos still exist in consumer component docs.\n');
for (const offender of offenders) {
  console.error(`  ${offender.file}`);
  for (const line of offender.lines) {
    console.error(`    ${line}`);
  }
}
console.error('\nMove these previews back to default-state specimens or matrix/frozen coverage.');
process.exit(1);
