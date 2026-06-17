#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/figma-parity-check.mjs
 *
 * Compares Figma component metadata (names, variants) with the manifest
 * componentSpecs (and utilities), reporting three classes of mismatch:
 *
 *   1. NAME DRIFT   — component in Figma snapshot not found in manifest
 *                     componentSpecs OR utilities section.
 *   2. VARIANT DRIFT — variantAxes in manifest disagree with figmaPropertyNames
 *                     keys in the snapshot for matched components.
 *                     EXCEPTION: "state" with only a single "State=default"
 *                     value is a Figma structural scaffold property (not a
 *                     React-facing variant). These are reported as informational
 *                     warnings, not blocking errors.
 *   3. CODE CONNECT — manifest has a component but figmaLink is null/empty/TODO
 *                     (no real Figma node ID → no Code Connect mapping possible).
 *                     Non-blocking: informational only.
 *
 * Exit codes:
 *   0  — no blocking mismatches
 *   1  — one or more blocking mismatches found
 *
 * Snapshot source: fixtures/figma-masters/snapshot-pre-8v3.json
 * Manifest source: public/hds-manifest.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(ROOT, 'public', 'hds-manifest.json');
const SNAPSHOT_PATH = path.join(ROOT, 'fixtures', 'figma-masters', 'snapshot-pre-8v3.json');

// ── helpers ──────────────────────────────────────────────────────────────────

function readJson(p) {
  if (!fs.existsSync(p)) {
    console.error(`[figma-parity-check] ERROR: file not found: ${p}`);
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`[figma-parity-check] ERROR: failed to parse ${p}: ${e.message}`);
    process.exit(1);
  }
}

function sortedAxes(arr) {
  return [...(arr || [])].sort();
}

function axesEqual(a, b) {
  const sa = sortedAxes(a);
  const sb = sortedAxes(b);
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

/**
 * Returns true when the only figmaPropertyNames key is "state" AND all of the
 * Figma states for this component have state="State=default".
 * These are Figma-internal scaffold entries — not React-facing variant axes.
 */
function isFigmaScaffoldStateOnly(figmaEntry) {
  const axes = Object.keys(figmaEntry.figmaPropertyNames || {});
  if (axes.length !== 1 || axes[0] !== 'state') return false;
  const states = figmaEntry.states || [];
  return states.length === 1 && states[0].state === 'State=default';
}

/**
 * A figmaLink is "real" (connected) if it exists, is non-empty, and does NOT
 * start with "TODO:" or contain only whitespace.
 */
function hasRealFigmaLink(spec) {
  const link = spec.figmaLink;
  if (!link) return false;
  if (typeof link !== 'string') return false;
  if (link.trim() === '') return false;
  if (link.startsWith('TODO:')) return false;
  return true;
}

// ── load sources ─────────────────────────────────────────────────────────────

const manifest = readJson(MANIFEST_PATH);
const snapshot = readJson(SNAPSHOT_PATH);

const componentSpecs = manifest.componentSpecs || {};
const utilitiesSpecs = manifest.utilities || {};

// All known manifest entries (componentSpecs + utilities)
const allManifestEntries = { ...componentSpecs, ...utilitiesSpecs };

// Index snapshot by component name
const snapshotByName = {};
for (const entry of (Array.isArray(snapshot) ? snapshot : [])) {
  const name = entry.component;
  if (name) snapshotByName[name] = entry;
}

// ── run checks ───────────────────────────────────────────────────────────────

const nameDriftErrors = [];          // blocking
const variantDriftErrors = [];       // blocking
const variantScaffoldWarnings = [];  // non-blocking (Figma scaffold pattern)
const codeConnectWarnings = [];      // non-blocking (informational)

// 1. NAME DRIFT — components in snapshot that have no manifest entry (in either section)
for (const name of Object.keys(snapshotByName)) {
  if (!(name in allManifestEntries)) {
    nameDriftErrors.push({
      component: name,
      issue: 'name-drift',
      detail: `Figma snapshot has "${name}" but no corresponding entry in manifest componentSpecs or utilities.`,
    });
  }
}

// 2. VARIANT DRIFT — for components in componentSpecs present in snapshot, compare axes
// (utilities are not expected to have variantAxes parity)
for (const [name, spec] of Object.entries(componentSpecs)) {
  const figmaEntry = snapshotByName[name];
  if (!figmaEntry) continue;

  const manifestAxes = spec.variantAxes || [];
  const figmaAxes = Object.keys(figmaEntry.figmaPropertyNames || {});

  if (!axesEqual(manifestAxes, figmaAxes)) {
    // Check if this is a Figma scaffold-only drift (state=default only)
    if (isFigmaScaffoldStateOnly(figmaEntry) && manifestAxes.length === 0) {
      variantScaffoldWarnings.push({
        component: name,
        issue: 'variant-scaffold-state-only',
        detail: `Figma has "state" axis with only State=default — this is a Figma scaffold property, not a React variant. manifest correctly omits it.`,
      });
    } else {
      variantDriftErrors.push({
        component: name,
        issue: 'variant-drift',
        manifestAxes: sortedAxes(manifestAxes),
        figmaAxes: sortedAxes(figmaAxes),
        detail: `manifest variantAxes [${sortedAxes(manifestAxes).join(', ')}] ≠ Figma axes [${sortedAxes(figmaAxes).join(', ')}]`,
      });
    }
  }
}

// 3. CODE CONNECT — manifest componentSpecs without a real figmaLink cannot be Code Connected
for (const [name, spec] of Object.entries(componentSpecs)) {
  if (!hasRealFigmaLink(spec)) {
    codeConnectWarnings.push({
      component: name,
      issue: 'missing-code-connect',
      figmaLink: spec.figmaLink ?? null,
      detail: `figmaLink is ${JSON.stringify(spec.figmaLink)} — no live Figma node ID, Code Connect mapping not possible.`,
    });
  }
}

// ── report ───────────────────────────────────────────────────────────────────

const totalBlocking = nameDriftErrors.length + variantDriftErrors.length;

if (nameDriftErrors.length > 0) {
  console.error(`\n[figma-parity-check] NAME DRIFT (${nameDriftErrors.length} blocking)`);
  for (const e of nameDriftErrors) {
    console.error(`  FAIL  ${e.component}: ${e.detail}`);
  }
}

if (variantDriftErrors.length > 0) {
  console.error(`\n[figma-parity-check] VARIANT DRIFT (${variantDriftErrors.length} blocking)`);
  for (const e of variantDriftErrors) {
    console.error(`  FAIL  ${e.component}: ${e.detail}`);
  }
}

if (variantScaffoldWarnings.length > 0) {
  console.warn(`\n[figma-parity-check] FIGMA SCAFFOLD STATE (${variantScaffoldWarnings.length} — non-blocking)`);
  for (const w of variantScaffoldWarnings) {
    console.warn(`  WARN  ${w.component}: ${w.detail}`);
  }
}

if (codeConnectWarnings.length > 0) {
  console.warn(`\n[figma-parity-check] CODE CONNECT GAPS (${codeConnectWarnings.length} — non-blocking)`);
  console.warn(`  INFO  All ${codeConnectWarnings.length} componentSpecs entries lack a real Figma node ID.`);
  console.warn(`  INFO  figmaLink values are null/empty/TODO — assign live node IDs to enable Code Connect.`);
}

if (totalBlocking > 0) {
  console.error(`\n[figma-parity-check] RESULT: FAIL — ${totalBlocking} blocking mismatch(es).`);
  process.exit(1);
}

// Build clean summary line
const summaryParts = [`name-drift: 0`, `variant-drift: 0`];
if (variantScaffoldWarnings.length > 0) {
  summaryParts.push(`scaffold-state-warn: ${variantScaffoldWarnings.length}`);
}
summaryParts.push(`code-connect-gaps: ${codeConnectWarnings.length} (non-blocking)`);

console.log(`[figma-parity-check] PASS — ${summaryParts.join(' | ')}`);
process.exit(0);
