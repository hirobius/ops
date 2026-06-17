#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/check-snapshot-staleness.mjs
 *
 * Snapshot staleness detector — warns (or errors in strict mode) when a
 * committed baseline JSON is older than any of its source files. The
 * intent: catch baselines that should have been regenerated after a source
 * change but weren't.
 *
 * Covered baseline→source relationships
 * ──────────────────────────────────────
 *   1. fixtures/figma-masters/snapshot-pre-8v3.json
 *        sources: pipeline/figma-masters-batch.mjs
 *                 public/hds-manifest.json
 *      Regenerate: node scripts/test-figma-masters-snapshot.mjs --update
 *
 *   2. fixtures/doc-pages/snapshot.json
 *        sources: src/app/pages/docs/**\/*.tsx  (recursive)
 *      Regenerate: node scripts/test-doc-pages-snapshot.mjs --update
 *
 * Modes
 * ─────
 *   default              warn-only; exits 0 even when stale baselines found
 *   STALENESS_ENFORCE=error  strict; exits 1 when any baseline is stale
 *   --json               emit canonical JSON to stdout (gate-output shape)
 *
 * Usage
 * ─────
 *   node scripts/check-snapshot-staleness.mjs
 *   node scripts/check-snapshot-staleness.mjs --json
 *   STALENESS_ENFORCE=error node scripts/check-snapshot-staleness.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STRICT = process.env.STALENESS_ENFORCE === 'error';
const jsonMode = hasJsonFlag(process.argv);

// ── ANSI helpers (suppressed in JSON mode) ────────────────────────────────────

const RESET = '\x1b[0m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';

function color(str, code) {
  if (jsonMode) return str;
  return `${code}${str}${RESET}`;
}

// ── mtime helpers ─────────────────────────────────────────────────────────────

/** Return mtime in ms, or null if the file does not exist. */
function mtime(absPath) {
  try {
    return fs.statSync(absPath).mtimeMs;
  } catch {
    return null;
  }
}

/** Recursively collect all files under a directory. */
function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

/**
 * Find the newest mtime (ms) across a list of file specifiers.
 * A specifier is either an absolute file path (string) or a
 * { dir, glob } object for recursive directory scanning.
 *
 * Returns { mtimeMs, file } for the newest source, or null if none found.
 */
function newestSource(specifiers) {
  let best = null;

  for (const spec of specifiers) {
    const paths = typeof spec === 'string' ? [spec] : [...walk(spec.dir)];
    for (const p of paths) {
      const t = mtime(p);
      if (t !== null && (best === null || t > best.mtimeMs)) {
        best = { mtimeMs: t, file: p };
      }
    }
  }

  return best;
}

// ── Baseline definitions ──────────────────────────────────────────────────────

/**
 * Each entry describes one known baseline→source relationship.
 *
 * @type {Array<{
 *   id: string,
 *   baseline: string,          // repo-relative path to the JSON baseline
 *   sources: (string|{dir:string})[],  // absolute paths or dir descriptors
 *   regenCmd: string,          // human-readable regen instruction
 * }>}
 */
const BASELINES = [
  {
    id: 'figma-masters',
    baseline: 'fixtures/figma-masters/snapshot-pre-8v3.json',
    sources: [
      path.join(ROOT, 'pipeline/figma-masters-batch.mjs'),
      path.join(ROOT, 'public/hds-manifest.json'),
    ],
    regenCmd: 'node scripts/test-figma-masters-snapshot.mjs --update',
  },
  {
    id: 'doc-pages',
    baseline: 'fixtures/doc-pages/snapshot.json',
    sources: [
      { dir: path.join(ROOT, 'src/app/pages/docs') },
    ],
    regenCmd: 'node scripts/test-doc-pages-snapshot.mjs --update',
  },
];

// ── Core check ────────────────────────────────────────────────────────────────

function isoRelative(ms) {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function check() {
  const results = [];

  for (const entry of BASELINES) {
    const baselineAbs = path.join(ROOT, entry.baseline);
    const baselineMtime = mtime(baselineAbs);

    if (baselineMtime === null) {
      // Baseline does not exist yet — not stale (fresh regen will create it).
      results.push({
        id: entry.id,
        baseline: entry.baseline,
        status: 'missing',
        stale: false,
        baselineMtimeMs: null,
        newestSourceMtimeMs: null,
        newestSourceFile: null,
        deltaMs: null,
        regenCmd: entry.regenCmd,
      });
      continue;
    }

    const newest = newestSource(entry.sources);
    if (newest === null) {
      // No sources found — treat as fresh (no signal).
      results.push({
        id: entry.id,
        baseline: entry.baseline,
        status: 'no-sources',
        stale: false,
        baselineMtimeMs: baselineMtime,
        newestSourceMtimeMs: null,
        newestSourceFile: null,
        deltaMs: null,
        regenCmd: entry.regenCmd,
      });
      continue;
    }

    const stale = newest.mtimeMs > baselineMtime;
    const deltaMs = stale ? newest.mtimeMs - baselineMtime : 0;

    results.push({
      id: entry.id,
      baseline: entry.baseline,
      status: stale ? 'stale' : 'fresh',
      stale,
      baselineMtimeMs: baselineMtime,
      newestSourceMtimeMs: newest.mtimeMs,
      newestSourceFile: path.relative(ROOT, newest.file),
      deltaMs,
      regenCmd: entry.regenCmd,
    });
  }

  return results;
}

// ── Reporting ─────────────────────────────────────────────────────────────────

function humanDelta(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 3_600_000)}h`;
}

function printHuman(results) {
  const staleEntries = results.filter((r) => r.stale);
  const freshEntries = results.filter((r) => !r.stale);

  for (const r of freshEntries) {
    if (r.status === 'missing') {
      process.stdout.write(
        color(`○ ${r.id}`, DIM) +
        color('  baseline not found (will be created on first regen)\n', DIM),
      );
    } else if (r.status === 'no-sources') {
      process.stdout.write(
        color(`○ ${r.id}`, DIM) +
        color('  no source files found — skipped\n', DIM),
      );
    } else {
      process.stdout.write(
        color(`✓ ${r.id}`, GREEN) +
        `  ${color(r.baseline, DIM)}\n`,
      );
    }
  }

  for (const r of staleEntries) {
    const severity = STRICT ? 'error' : 'warn';
    const label = STRICT ? color('✗', RED) : color('⚠', YELLOW);
    const age = r.deltaMs ? ` (baseline is ${humanDelta(r.deltaMs)} older)` : '';
    process.stderr.write(
      `${label} ${r.id}${age}\n` +
      `    baseline:    ${r.baseline}  ${color(`(${isoRelative(r.baselineMtimeMs)})`, DIM)}\n` +
      `    newest src:  ${r.newestSourceFile}  ${color(`(${isoRelative(r.newestSourceMtimeMs)})`, DIM)}\n` +
      `    regen with:  ${color(r.regenCmd, DIM)}\n`,
    );
    if (severity === 'warn' && !STRICT) {
      process.stderr.write(
        color(
          `    (warn-only — set STALENESS_ENFORCE=error to make this blocking)\n`,
          DIM,
        ),
      );
    }
  }

  if (staleEntries.length === 0) {
    process.stdout.write(
      color(
        `\nAll ${results.length} snapshot baseline(s) are up-to-date.\n`,
        GREEN,
      ),
    );
  } else {
    const noun = staleEntries.length === 1 ? 'baseline' : 'baselines';
    process.stderr.write(
      `\n${staleEntries.length} stale ${noun} of ${results.length} checked.\n`,
    );
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const results = check();
  const staleEntries = results.filter((r) => r.stale);

  if (jsonMode) {
    const violations = staleEntries.map((r) => ({
      file: r.baseline,
      line: null,
      rule: 'SNAPSHOT_STALE',
      severity: STRICT ? 'error' : 'warn',
      message: `Snapshot baseline is older than its source by ${r.deltaMs != null ? humanDelta(r.deltaMs) : 'unknown'}. Regen: ${r.regenCmd}`,
      newestSourceFile: r.newestSourceFile,
      baselineMtimeMs: r.baselineMtimeMs,
      newestSourceMtimeMs: r.newestSourceMtimeMs,
      deltaMs: r.deltaMs,
    }));

    emitResult(
      {
        violations,
        summary: {
          checked: results.length,
          stale: staleEntries.length,
          fresh: results.filter((r) => !r.stale).length,
          strictMode: STRICT,
        },
        ok: staleEntries.length === 0 || !STRICT,
      },
      true,
    );
  } else {
    printHuman(results);
  }

  if (STRICT && staleEntries.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main();
