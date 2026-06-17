#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/generate-manifest-projection.mjs
 *
 * Generates public/hds-manifest-agent.json — a lean projection of
 * hds-manifest.json for agent/LLM consumption.
 *
 * Strips: consumers, description, slots, tokenMapping, componentProperties,
 *   propConstraints, preview, sourcePath, filePath, figmaPropertyMapping,
 *   a11yRules, states, figmaId, figmaUrl, categorySource, governedCategory,
 *   hidden, docExempt, compoundMembers, sourceExport, figmaLink (figma-only)
 *
 * Keeps: category, tier, props, allowedChildren, variantAxes, requiredProps
 *
 * Also strips the full `tokens` section (use public/llms.txt for token ref).
 * Filters utilities to non-hidden entries only.
 *
 * Invocation:
 *   node scripts/generate-manifest-projection.mjs
 *   node scripts/generate-manifest-projection.mjs --stats   # size report only
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'public/hds-manifest.json');
const OUT = path.join(ROOT, 'public/hds-manifest-agent.json');

const STATS_ONLY = process.argv.includes('--stats');

const SPEC_STRIP = new Set([
  'consumers', 'description', 'slots', 'tokenMapping', 'componentProperties',
  'propConstraints', 'preview', 'sourcePath', 'filePath', 'figmaPropertyMapping',
  'a11yRules', 'states', 'figmaId', 'figmaUrl', 'categorySource', 'governedCategory',
  'hidden', 'docExempt', 'compoundMembers', 'sourceExport', 'figmaLink',
]);

function slimSpec(spec) {
  const out = {};
  for (const [k, v] of Object.entries(spec)) {
    if (!SPEC_STRIP.has(k)) out[k] = v;
  }
  return out;
}

const raw = fs.readFileSync(SRC, 'utf8');
const m = JSON.parse(raw);

if (STATS_ONLY) {
  const srcKB = Math.round(raw.length / 1024);
  let specTotal = 0, utilTotal = 0;
  if (m.componentSpecs) specTotal = JSON.stringify(m.componentSpecs).length;
  if (m.utilities) utilTotal = JSON.stringify(m.utilities).length;
  if (m.tokens) console.log('tokens section:', Math.round(JSON.stringify(m.tokens).length / 1024) + 'KB');
  console.log('componentSpecs:', Math.round(specTotal / 1024) + 'KB');
  console.log('utilities:', Math.round(utilTotal / 1024) + 'KB');
  console.log('total src:', srcKB + 'KB');
  process.exit(0);
}

const slim = { ...m };

// Strip tokens section — agents use public/llms.txt
delete slim.tokens;

// Slim componentSpecs
if (slim.componentSpecs) {
  const slimmed = {};
  for (const [name, spec] of Object.entries(slim.componentSpecs)) {
    slimmed[name] = slimSpec(spec);
  }
  slim.componentSpecs = slimmed;
}

// Slim utilities — filter to non-hidden, strip same heavy fields
if (slim.utilities) {
  const slimmed = {};
  for (const [name, spec] of Object.entries(slim.utilities)) {
    if (spec.hidden) continue;
    slimmed[name] = slimSpec(spec);
  }
  slim.utilities = slimmed;
}

// Add generation metadata
slim._agentProjection = {
  generatedAt: new Date().toISOString(),
  strippedFields: Array.from(SPEC_STRIP),
  note: 'Lean agent projection. Full manifest at public/hds-manifest.json.',
};

const out = JSON.stringify(slim, null, 2);
fs.writeFileSync(OUT, out);

const srcKB = Math.round(raw.length / 1024);
const outKB = Math.round(out.length / 1024);
console.log(`Generated ${path.relative(ROOT, OUT)}: ${srcKB}KB → ${outKB}KB (saved ${srcKB - outKB}KB)`);
