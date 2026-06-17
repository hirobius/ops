#!/usr/bin/env node
/**
 * sales-pipeline.mjs — surface clients with stale or missing last-contact,
 * with the recommended next touch.
 *
 * Reads clients/<slug>/status.json across the repo, computes ageDays for
 * each, buckets into overdue / current / neverContacted. Inactive
 * statuses (paused, archived) are excluded from the action surfaces.
 *
 * --json: emit machine-readable summary (SkillsBar JsonPreview shape).
 * default: emit a terse text view for the terminal.
 *
 * Refs: t_30afbd9f / Sales A — sales-pipeline
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ACTIONABLE_STATUSES = new Set(['active', 'prospect']);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Integer days from `iso` (a YYYY-MM-DD or full ISO) to `now`. Negative is
 * future; we floor so same-day → 0. Returns null for empty / unparseable.
 */
export function ageDays(iso, now) {
  if (typeof iso !== 'string' || iso.length === 0) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / MS_PER_DAY);
}

/**
 * Pure: classify records into pipeline buckets.
 *
 * @param {Array<{
 *   slug: string,
 *   status: string,
 *   lastContactAt: string | null,
 *   lastContactKind: string | null,
 *   nextTouchSuggestion: string | null,
 *   overdueAfterDays: number,
 * }>} records
 * @param {Date} now
 */
export function computePipeline(records, now) {
  const totalClients = records.length;
  const overdue = [];
  const current = [];
  const neverContacted = [];

  for (const r of records) {
    if (!ACTIONABLE_STATUSES.has(r.status)) continue;
    const age = ageDays(r.lastContactAt, now);
    const enriched = {
      slug: r.slug,
      status: r.status,
      lastContactAt: r.lastContactAt,
      lastContactKind: r.lastContactKind,
      nextTouchSuggestion: r.nextTouchSuggestion,
      ageDays: age,
    };
    if (age === null) {
      neverContacted.push(enriched);
      continue;
    }
    const overdueAfter = typeof r.overdueAfterDays === 'number' ? r.overdueAfterDays : 14;
    if (age > overdueAfter) overdue.push(enriched);
    else current.push(enriched);
  }

  overdue.sort((a, b) => b.ageDays - a.ageDays);
  current.sort((a, b) => b.ageDays - a.ageDays);

  return { totalClients, overdue, current, neverContacted };
}

/** Read clients/<slug>/status.json files under the repo. Pure once given a fs. */
export async function readStatusFiles(rootDir = REPO_ROOT, fs = { readFile, readdir }) {
  const clientsDir = path.join(rootDir, 'clients');
  let entries;
  try {
    entries = await fs.readdir(clientsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const records = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('_')) continue;
    const p = path.join(clientsDir, e.name, 'status.json');
    try {
      const raw = await fs.readFile(p, 'utf8');
      const data = JSON.parse(raw);
      records.push({ slug: data.slug ?? e.name, ...data });
    } catch {
      // missing or invalid — skip silently
    }
  }
  return records;
}

function renderText(summary) {
  const lines = [`Sales pipeline — ${summary.totalClients} client(s)`];
  if (summary.overdue.length > 0) {
    lines.push('', `Overdue (${summary.overdue.length}):`);
    for (const r of summary.overdue) {
      lines.push(
        `  ${r.slug.padEnd(24)} ${r.ageDays}d  ${r.lastContactKind ?? '—'}  → ${r.nextTouchSuggestion ?? 'pick a touch'}`,
      );
    }
  }
  if (summary.neverContacted.length > 0) {
    lines.push('', `Never contacted (${summary.neverContacted.length}):`);
    for (const r of summary.neverContacted) {
      lines.push(`  ${r.slug.padEnd(24)} → ${r.nextTouchSuggestion ?? 'pick a touch'}`);
    }
  }
  if (summary.current.length > 0) {
    lines.push('', `Current (${summary.current.length}):`);
    for (const r of summary.current) {
      lines.push(`  ${r.slug.padEnd(24)} ${r.ageDays}d  next: ${r.nextTouchSuggestion ?? '—'}`);
    }
  }
  return lines.join('\n');
}

async function main() {
  const wantJson = process.argv.includes('--json');
  const records = await readStatusFiles();
  const summary = computePipeline(records, new Date());
  if (wantJson) {
    process.stdout.write(JSON.stringify({ ok: true, summary }, null, 2) + '\n');
  } else {
    process.stdout.write(renderText(summary) + '\n');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`sales-pipeline: ${err?.message ?? err}\n`);
    process.exit(1);
  });
}
