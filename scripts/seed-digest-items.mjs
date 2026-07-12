#!/usr/bin/env node
/**
 * scripts/seed-digest-items.mjs — import committed digest JSON into the
 * digest_items store (Digest P1, ops#78).
 *
 * The "scrub my newsletters" trigger phrase (docs/ai/HANDOFF.md) commits a
 * JSON file under src/app/digests/*.json. /ops/digest used to read those
 * files directly via import.meta.glob; now it reads the live `digest_items`
 * table (migration 0011) so items can carry a real status lifecycle
 * (dismiss/restore, then P2-P4's analyze/promote). This script is the import
 * step in between: run it after committing a new digest JSON to bring it into
 * the store.
 *
 * Idempotent + keyed: each item's stable `item_key` is `<date>::<title-slug>`
 * (digestItemKey below) — re-running the seed for the same committed JSON
 * upserts in place (lib/supabase/digests.mjs::upsertDigestItems, onConflict:
 * item_key), never duplicates. Existing rows' `status` (e.g. a dismiss) is
 * NOT touched by upsert unless included in the row — see mapDigestFileToRows,
 * which only sets status:'new' for the insert path; Postgres upsert with a
 * partial column list would still overwrite status on conflict, so this is
 * deliberately fill-only: rows already present are skipped (matching
 * sync-preview-urls.mjs's fill-only convention), never re-upserted wholesale.
 *
 * Usage:
 *   node scripts/seed-digest-items.mjs [--json] [--apply] [--help]
 *
 * `--dry-run` is the DEFAULT — lists what it would import and writes nothing.
 * Pass `--apply` to write for real.
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getServiceClient } from '../lib/supabase/server.mjs';
import { listDigestItems, upsertDigestItems } from '../lib/supabase/digests.mjs';
import { appendRun } from '../lib/ops/run-log.mjs';
import { notifyEvent } from '../lib/ops/notify.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIGESTS_DIR = path.resolve(__dirname, '../src/app/digests');
const EXISTING_FETCH_LIMIT = 2000;

/** Lowercase, ASCII-slug a title for use in a stable key. */
export function slugify(title) {
  return String(title)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The stable, idempotent-upsert key for one digest item: '<date>::<title-slug>'. */
export function digestItemKey(date, title) {
  return `${date}::${slugify(title)}`;
}

/**
 * Maps one parsed digest JSON file to `digest_items` rows. Pure — no I/O, no
 * Date. Each item gets status:'new' (the insert-path default; see the
 * fill-only note above for why re-running never clobbers a dismissed row).
 * @param {{ date: string, source?: string, items?: object[] }} file
 * @returns {object[]}
 */
export function mapDigestFileToRows(file) {
  if (!file || !Array.isArray(file.items)) return [];
  return file.items
    .filter((item) => item && typeof item.title === 'string' && item.title.trim())
    .map((item) => ({
      item_key: digestItemKey(file.date, item.title),
      date: file.date,
      source: file.source ?? null,
      title: item.title,
      summary: item.summary ?? null,
      ops_angle: item.opsAngle ?? null,
      tag: item.tag ?? null,
      links: Array.isArray(item.links) ? item.links : [],
      status: 'new',
    }));
}

/**
 * Reads every src/app/digests/*.json file from disk and maps them to rows.
 * Malformed JSON is skipped (logged), not fatal — one bad file shouldn't
 * block importing the rest.
 * @returns {object[]}
 */
export function readDigestFiles(dir = DIGESTS_DIR) {
  if (!fs.existsSync(dir)) return [];
  const rows = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try {
      const file = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      rows.push(...mapDigestFileToRows(file));
    } catch (err) {
      console.error(`${name}: skipped (${err instanceof Error ? err.message : String(err)})`);
    }
  }
  return rows;
}

function parseArgs(argv) {
  const o = { apply: false, json: false, help: false };
  for (const arg of argv) {
    switch (arg) {
      case '--apply':
        o.apply = true;
        break;
      case '--dry-run':
        o.apply = false; // explicit no-op — dry-run is already the default
        break;
      case '--json':
        o.json = true;
        break;
      case '--help':
      case '-h':
        o.help = true;
        break;
      default:
        console.error(`Unknown flag: ${arg}`);
        o.help = true;
    }
  }
  return o;
}

function printHelp() {
  console.log(
    `scripts/seed-digest-items.mjs — import committed digest JSON into digest_items (ops#78)\n\n` +
      `Usage:\n` +
      `  node scripts/seed-digest-items.mjs [--json] [--apply]\n\n` +
      `Reads every src/app/digests/*.json, maps each item to a digest_items row\n` +
      `keyed on '<date>::<title-slug>', and upserts the ones not already in the\n` +
      `store (fill-only — never overwrites an existing row's status).\n\n` +
      `--dry-run is the DEFAULT — lists what it would import, writes nothing.\n` +
      `Pass --apply to import for real (notify + run-log).\n\n` +
      `Flags:\n` +
      `  --apply     perform the writes (default is dry-run/list-only)\n` +
      `  --dry-run   explicit no-op — same as the default\n` +
      `  --json      machine-readable output\n` +
      `  --help      print this usage and exit 0\n`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const rows = readDigestFiles();

  let sb;
  try {
    sb = await getServiceClient();
  } catch (err) {
    console.error(`Supabase not reachable: ${err.message}`);
    process.exit(1);
    return;
  }

  const { data: existing, error: listError } = await listDigestItems(sb, {
    limit: EXISTING_FETCH_LIMIT,
    includeDismissed: true,
  });
  if (listError) {
    console.error(`Supabase query failed: ${listError.message}`);
    process.exit(1);
    return;
  }
  const existingKeys = new Set((existing ?? []).map((r) => r.item_key));
  const toImport = rows.filter((r) => !existingKeys.has(r.item_key));

  if (args.json) {
    console.log(
      JSON.stringify({ found: rows.length, toImport: toImport.length, apply: args.apply, rows: toImport }, null, 2),
    );
  } else {
    console.log(`Digest items found on disk: ${rows.length} · not yet in the store: ${toImport.length}`);
    if (toImport.length === 0) console.log('Nothing to import.');
    else for (const r of toImport) console.log(`  ${r.item_key}`);
  }

  if (!args.apply) {
    if (!args.json) console.log('\nDry run — no writes. Pass --apply to import for real.');
    process.exit(0);
    return;
  }

  if (toImport.length === 0) {
    process.exit(0);
    return;
  }

  const { error: upsertError } = await upsertDigestItems(sb, toImport);
  if (upsertError) {
    console.error(`Import failed: ${upsertError.message}`);
    process.exit(1);
    return;
  }

  const nowIso = new Date().toISOString();
  await notifyEvent({
    ts: nowIso,
    kind: 'completed',
    title: `digest items imported`,
    detail: `${toImport.length} item(s) seeded into digest_items`,
  });
  appendRun({
    ts: nowIso,
    actor: 'seed-digest-items',
    task: '#78',
    outcome: 'imported',
    summary: `${toImport.length} digest item(s) imported into the store`,
  });

  console.log(`\nImported ${toImport.length} digest item(s).`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(e?.stack || String(e));
    process.exit(1);
  });
}
