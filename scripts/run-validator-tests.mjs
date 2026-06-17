#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/run-validator-tests.mjs
 *
 * Fixture-driven test runner for validators and pipeline units.
 * Uses Node built-in node:test — no external test dependencies.
 *
 * Usage:
 *   node scripts/run-validator-tests.mjs              # run all fixtures
 *   node scripts/run-validator-tests.mjs --filter=parse-jsx
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES_DIR = path.join(ROOT, 'fixtures');

const filterArg = process.argv.find(a => a.startsWith('--filter='));
const filter = filterArg ? filterArg.split('=')[1] : null;

// Discover fixture directories
if (!fs.existsSync(FIXTURES_DIR)) {
  console.log('No fixtures directory found — nothing to test.');
  process.exit(0);
}

const unitDirs = fs.readdirSync(FIXTURES_DIR).filter(name => {
  if (filter && name !== filter) return false;
  const full = path.join(FIXTURES_DIR, name);
  return fs.statSync(full).isDirectory();
});

if (unitDirs.length === 0) {
  if (filter) {
    console.error(`No fixtures found for filter: ${filter}`);
    process.exit(1);
  }
  console.log('No fixture directories found.');
  process.exit(0);
}

// Dynamically import the validator for each unit
async function loadValidator(unitId) {
  const resolvedName = unitId === 'orchestrator' ? 'index' : unitId;
  const candidates = [
    path.join(ROOT, 'validators', resolvedName.replace(/^p\d+-\d+-/, '') + '.mjs'),
    path.join(ROOT, 'pipeline', resolvedName.replace(/^p\d+-\d+-/, '') + '.mjs'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return (await import(c)).default ?? (await import(c));
  }
  return null;
}

for (const unitId of unitDirs) {
  const caseDirs = fs.readdirSync(path.join(FIXTURES_DIR, unitId)).filter(c => {
    return fs.statSync(path.join(FIXTURES_DIR, unitId, c)).isDirectory();
  });

  if (caseDirs.length === 0) continue;

  const validator = await loadValidator(unitId);

  for (const caseName of caseDirs) {
    const caseDir = path.join(FIXTURES_DIR, unitId, caseName);
    const inputFile = fs.readdirSync(caseDir).find(f => f.startsWith('input.'));
    const expectedFile = path.join(caseDir, 'expected.json');

    if (!inputFile || !fs.existsSync(expectedFile)) continue;

    const inputPath = path.join(caseDir, inputFile);
    const input = inputFile.endsWith('.json')
      ? JSON.parse(fs.readFileSync(inputPath, 'utf8'))
      : fs.readFileSync(inputPath, 'utf8');
    const expected = JSON.parse(fs.readFileSync(expectedFile, 'utf8'));

    test(`${unitId} / ${caseName}`, async () => {
      if (!validator) {
        // Validator not yet implemented — skip gracefully
        console.log(`  [skip] ${unitId}: validator not implemented yet`);
        return;
      }
      const result = await validator(input);
      for (const [k, v] of Object.entries(expected)) {
        assert.deepEqual(result[k], v, `${unitId}/${caseName}: key "${k}" mismatch`);
      }
    });
  }
}
