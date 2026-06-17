#!/usr/bin/env node
/**
 * validate-guardrail-registry.mjs
 *
 * Asserts that every scripts/check-*.mjs and scripts/audit-*.mjs file has
 * a corresponding entry in docs/guardrails/registry.json.
 *
 * Exit 0: all validators are registered.
 * Exit 1: one or more validators are missing from the registry.
 *
 * Flags:
 *   --update    Auto-append missing entries with stub fields (owner=Adrian,
 *               source=human, severity=warn, fixturePath=null).
 *               Does not overwrite existing entries.
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REGISTRY_PATH = join(ROOT, 'docs', 'guardrails', 'registry.json');
const SCRIPTS_DIR = join(ROOT, 'scripts');

const UPDATE_MODE = process.argv.includes('--update');

// ── Load registry ────────────────────────────────────────────────────────────

function loadRegistry() {
  const raw = readFileSync(REGISTRY_PATH, 'utf8');
  return JSON.parse(raw);
}

// ── Discover scripts ─────────────────────────────────────────────────────────

function discoverScripts() {
  const files = readdirSync(SCRIPTS_DIR);
  return files
    .filter(f => /^(check-|audit-).*\.mjs$/.test(f))
    .map(f => basename(f, '.mjs'))
    .sort();
}

// ── Extract first sentence from JSDoc ────────────────────────────────────────

function extractDescription(scriptName) {
  const scriptPath = join(SCRIPTS_DIR, `${scriptName}.mjs`);
  let source;
  try {
    source = readFileSync(scriptPath, 'utf8');
  } catch {
    return `TODO: add description — ${scriptName}.mjs could not be read.`;
  }

  // Find the first /** ... */ block
  const jsdocMatch = source.match(/\/\*\*([\s\S]*?)\*\//);
  if (!jsdocMatch) {
    return `TODO: add description — ${scriptName}.mjs has no leading JSDoc block.`;
  }

  const jsdocContent = jsdocMatch[1];
  // Strip * prefixes, collect non-empty lines that aren't the filename
  const lines = jsdocContent
    .split('\n')
    .map(l => l.replace(/^\s*\*\s?/, '').trim())
    .filter(l => l.length > 0 && l !== scriptName + '.mjs' && !l.startsWith('@'));

  if (lines.length === 0) {
    return `TODO: add description — ${scriptName}.mjs JSDoc block is empty.`;
  }

  // Return first meaningful line (first sentence)
  const first = lines[0];
  return first.length > 0 ? first : `TODO: add description — ${scriptName}.mjs has no description text.`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const registry = loadRegistry();
const registeredIds = new Set(registry.gates.map(g => g.id));
const scripts = discoverScripts();

const missing = scripts.filter(id => !registeredIds.has(id));

if (missing.length === 0) {
  console.log(`✓ validate-guardrail-registry — all ${scripts.length} validator(s) are registered.`);
  process.exit(0);
}

if (UPDATE_MODE) {
  console.log(`Appending ${missing.length} missing entry(ies) to registry.json...`);
  for (const id of missing) {
    const description = extractDescription(id);
    registry.gates.push({
      id,
      description,
      severity: 'warn',
      gateScript: `scripts/${id}.mjs`,
      fixturePath: null,
      lastFiringAt: null,
      lastViolationAt: null,
      owner: 'Adrian',
      source: 'human',
    });
    console.log(`  + ${id}`);
  }
  registry.gates.sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf8');
  console.log(`✓ registry.json updated — ${registry.gates.length} total gate(s).`);
  process.exit(0);
}

// Hard-fail: print missing list and exit 1
console.error(`✗ validate-guardrail-registry — ${missing.length} unregistered validator(s):`);
for (const id of missing) {
  console.error(`  - ${id}  (scripts/${id}.mjs)`);
}
console.error('');
console.error('Fix: run `node scripts/validate-guardrail-registry.mjs --update` to auto-append stubs,');
console.error('     then fill in the description field for each new entry.');
process.exit(1);
