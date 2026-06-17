#!/usr/bin/env node
/**
 * scripts/snapshot-orchestration.mjs
 *
 * Daily snapshot of docs/ai/orchestration.json to
 * docs/ai/snapshots/orchestration-YYYY-MM-DD.json. Idempotent same-day
 * (overwrites). Trims to last 30 days.
 *
 * Per `13g-25-orchestration-snapshot-cron` in the hardening roadmap.
 *
 * Usage: node scripts/snapshot-orchestration.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'docs/ai/orchestration.json');
const DIR = path.join(ROOT, 'docs/ai/snapshots');
const TRIM_DAYS = 30;

if (!fs.existsSync(SRC)) {
  console.error(`✗ snapshot-orchestration: source not found at ${SRC}`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const target = path.join(DIR, `orchestration-${today}.json`);

fs.mkdirSync(DIR, { recursive: true });
fs.copyFileSync(SRC, target);
console.log(`✓ snapshot-orchestration: wrote ${path.relative(ROOT, target)}`);

// Trim
const cutoff = Date.now() - TRIM_DAYS * 24 * 36e5;
const entries = fs.readdirSync(DIR);
let trimmed = 0;
for (const name of entries) {
  const m = name.match(/^orchestration-(\d{4}-\d{2}-\d{2})\.json$/);
  if (!m) continue;
  const t = new Date(m[1]).getTime();
  if (t < cutoff) {
    fs.unlinkSync(path.join(DIR, name));
    trimmed++;
  }
}
if (trimmed > 0) console.log(`  trimmed ${trimmed} snapshot(s) older than ${TRIM_DAYS} days`);
