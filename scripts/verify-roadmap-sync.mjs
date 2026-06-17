#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * Verify that roadmap.json summary counts match the displayed items in each section.
 * This prevents drift between the top-level summary and the actual section data.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ROADMAP = join(ROOT, 'src/app/data/roadmap.json');

const roadmap = JSON.parse(readFileSync(ROADMAP, 'utf8'));
let errors = [];

// Helper to count items in sections
const countSection = (section) => {
  if (section.items) {
    return section.items.length;
  }
  if (section.groups) {
    return section.groups.reduce((sum, group) => sum + group.items.length, 0);
  }
  return 0;
};

// Verify each section's count matches the summary
for (const section of roadmap.sections) {
  const expectedCount = roadmap.summary[section.id];
  const actualCount = countSection(section);

  if (expectedCount !== actualCount) {
    errors.push(
      `❌ ${section.id}: summary says ${expectedCount} but section has ${actualCount} items`
    );
  } else {
    console.log(`✓ ${section.id}: ${actualCount} items (matches summary)`);
  }
}

if (errors.length > 0) {
  console.error('\n⚠️  Roadmap sync errors found:');
  errors.forEach(err => console.error(err));
  console.error('\nRun: pnpm roadmap:data');
  process.exit(1);
}

console.log('\n✓ All roadmap sections are in sync');
