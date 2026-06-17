#!/usr/bin/env node
/**
 * scripts/update-precommit-hash.mjs
 *
 * Recompute the canonical SHA-256 of .husky/pre-commit and write it to
 * docs/guardrails/registry.json as `precommitStructureHash`.
 *
 * Run this after intentional changes to .husky/pre-commit and commit
 * the registry update together with the hook change.
 *
 * Usage:
 *   node scripts/update-precommit-hash.mjs
 *
 * Exit codes:
 *   0 — success (hash updated OR already matches — idempotent)
 *   1 — error (file not found, parse failure, write failure)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPrecommit } from './lib/precommit-canonical.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRECOMMIT = path.join(ROOT, '.husky/pre-commit');
const REGISTRY = path.join(ROOT, 'docs/guardrails/registry.json');

// ── Read pre-commit ──────────────────────────────────────────────────────────
if (!fs.existsSync(PRECOMMIT)) {
  console.error(`✗ update-precommit-hash — .husky/pre-commit not found at ${PRECOMMIT}`);
  process.exit(1);
}

const rawContent = fs.readFileSync(PRECOMMIT, 'utf8');
const newHash = hashPrecommit(rawContent);

// ── Read registry ────────────────────────────────────────────────────────────
if (!fs.existsSync(REGISTRY)) {
  console.error(`✗ update-precommit-hash — registry not found at ${REGISTRY}`);
  process.exit(1);
}

let registryObj;
try {
  registryObj = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
} catch (e) {
  console.error(`✗ update-precommit-hash — could not parse registry: ${e.message}`);
  process.exit(1);
}

const oldHash = registryObj.precommitStructureHash || '(none)';

// ── Idempotent check ─────────────────────────────────────────────────────────
if (registryObj.precommitStructureHash === newHash) {
  console.log(`✓ update-precommit-hash — no change (hash already matches: ${newHash})`);
  process.exit(0);
}

// ── Update registry ──────────────────────────────────────────────────────────
registryObj.precommitStructureHash = newHash;
registryObj.precommitStructureHashUpdatedAt = new Date().toISOString();

const updatedJson = JSON.stringify(registryObj, null, 2) + '\n';

// Atomic write: temp file + rename
const tmpPath = path.join(os.tmpdir(), `registry-${Date.now()}.json`);
try {
  fs.writeFileSync(tmpPath, updatedJson, 'utf8');
  fs.renameSync(tmpPath, REGISTRY);
} catch (e) {
  // Clean up temp file on failure
  try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  console.error(`✗ update-precommit-hash — write failed: ${e.message}`);
  process.exit(1);
}

console.log(`✓ update-precommit-hash`);
console.log(`    old: ${oldHash}`);
console.log(`    new: ${newHash}`);
console.log(`  Commit registry.json alongside any .husky/pre-commit changes.`);
process.exit(0);
