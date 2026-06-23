/**
 * scripts/import-tasks.mjs — consolidate all tasks into the Supabase `tasks` table.
 *
 * Targets the FINALIZED schema in supabase/migrations/0003_tasks.sql (from the
 * ops-archive consolidation-handoff). Three sources, collision-free namespaced keys:
 *   - tracker  : the ops-archive export (drop at data/tracker-tasks.export.json, or
 *                --tracker <path>). Rows are already schema-shaped → passed through
 *                (minus the descriptive-only `is_done`). Keys `tracker:<NATIVE-ID>`.
 *   - backlog  : this repo's BACKLOG.md.            Keys `backlog:<id>`.
 *   - client   : clients/<slug>/tasks.json.         Keys `client:<slug>:<id>`.
 *                (slug-namespaced — the briefing's bare `client:<id>` would collide
 *                across clients, e.g. two "1-0"s.)
 *
 * Default DROP filter (handoff recommendation → ~101 tracker rows): exclude
 * import_flags leads-pipeline (→ separate `leads` table), client-record (→ `clients`),
 * test-fixture (fictional seeds). Use --include-all to keep them.
 *
 * Usage:
 *   node scripts/import-tasks.mjs                 # dry run → data/tasks.normalized.json + summary
 *   node scripts/import-tasks.mjs --tracker p     # specific tracker export path
 *   node scripts/import-tasks.mjs --include-all   # don't apply the DROP filter
 *   node scripts/import-tasks.mjs --write         # upsert into Supabase (needs SUPABASE_* env)
 *
 * Idempotent: upserts on `key`. Dry run by default — review before --write.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const INCLUDE_ALL = args.includes('--include-all');
const trackerArg = args[args.indexOf('--tracker') + 1];
const TRACKER_PATH = path.resolve(
  ROOT,
  args.includes('--tracker') && trackerArg ? trackerArg : 'data/tracker-tasks.export.json',
);
const OUT_PATH = path.resolve(ROOT, 'data/tasks.normalized.json');

const DROP_FLAGS = new Set(['leads-pipeline', 'client-record', 'test-fixture']);

// ── helpers ─────────────────────────────────────────────────────────────────────
function status3(raw) {
  const k = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (['done', 'x', '[x]', 'complete', 'completed'].includes(k)) return 'done';
  if (['blocked', 'manual-block', '!', '[!]', 'on-hold'].includes(k)) return 'blocked';
  return 'open';
}

function clientPriority(p) {
  if (p === 'high' || p === 'med' || p === 'low') return p;
  const n = Number(p);
  if (!Number.isFinite(n)) return null;
  return n <= 0 ? 'high' : n === 1 ? 'med' : 'low';
}

/** A row shaped for the `tasks` table. Omit created_at/updated_at → DB defaults fill. */
function row(o) {
  return {
    key: o.key,
    source: o.source,
    native_key: o.native_key ?? null,
    lane: o.lane,
    group: o.group ?? null,
    phase: o.phase ?? null,
    title: o.title,
    status: o.status ?? 'open',
    raw_status: o.raw_status ?? null,
    derived: o.derived ?? null,
    stage: o.stage ?? null,
    priority: o.priority ?? null,
    due: o.due ?? null,
    owner: o.owner ?? null,
    effort: o.effort ?? null,
    tags: o.tags ?? [],
    deps: o.deps ?? [],
    blocked_by: o.blocked_by ?? [],
    notes: o.notes ?? [],
    subtasks: o.subtasks ?? [],
    import_flags: o.import_flags ?? [],
    sort_order: o.sort_order ?? 0,
    deleted_at: o.deleted_at ?? null,
  };
}

// ── Source: tracker export (already schema-shaped) ───────────────────────────────
function buildTracker() {
  if (!fs.existsSync(TRACKER_PATH)) {
    console.warn(
      `! tracker export not found at ${path.relative(ROOT, TRACKER_PATH)} — skipping (drop the handoff export there).`,
    );
    return { rows: [], dropped: 0 };
  }
  let json;
  try {
    json = JSON.parse(fs.readFileSync(TRACKER_PATH, 'utf8'));
  } catch (e) {
    console.warn(`! could not parse tracker export: ${e.message}`);
    return { rows: [], dropped: 0 };
  }
  const list = Array.isArray(json) ? json : (json.tasks ?? []);
  let dropped = 0;
  const rows = [];
  for (const t of list) {
    const flags = Array.isArray(t.import_flags) ? t.import_flags : [];
    if (!INCLUDE_ALL && flags.some((f) => DROP_FLAGS.has(f))) {
      dropped++;
      continue;
    }
    const { is_done, id, created_at, updated_at, ...rest } = t; // strip descriptive/auto fields
    void is_done;
    void id;
    const clean = { ...rest };
    if (created_at != null) clean.created_at = created_at;
    if (updated_at != null) clean.updated_at = updated_at;
    rows.push(clean);
  }
  return { rows, dropped };
}

// ── Source: BACKLOG.md ───────────────────────────────────────────────────────────
function buildBacklog() {
  const file = path.join(ROOT, 'BACKLOG.md');
  if (!fs.existsSync(file)) return [];
  const rows = [];
  let phase = null;
  let i = 0;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const h = line.match(/^##\s+(.+?)(?:\s+_\(\d+\)_)?\s*$/);
    if (h) {
      phase = h[1].trim();
      continue;
    }
    const m = line.match(/^- `([a-z-]+)` \*\*([^*]+)\*\* — (.*)$/); // legend lines lack **id** → skipped
    if (!m) continue;
    const [, badge, id, title] = m;
    rows.push(
      row({
        key: `backlog:${id.trim()}`,
        source: 'backlog',
        native_key: id.trim(),
        lane: 'backlog',
        group: 'Backlog',
        phase,
        title: title.trim(),
        status: status3(badge),
        raw_status: badge,
        sort_order: i++,
      }),
    );
  }
  return rows;
}

// ── Source: clients/*/tasks.json ─────────────────────────────────────────────────
function buildClients() {
  const dir = path.join(ROOT, 'clients');
  if (!fs.existsSync(dir)) return [];
  const rows = [];
  for (const slug of fs.readdirSync(dir)) {
    if (slug === '_template') continue;
    const file = path.join(dir, slug, 'tasks.json');
    if (!fs.existsSync(file)) continue;
    let json;
    try {
      json = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    let i = 0;
    for (const ph of json.phases ?? []) {
      for (const lane of ph.swimlanes ?? []) {
        for (const t of lane.tasks ?? []) {
          const notes = [t.notes, t.blockedReason && `Blocked: ${t.blockedReason}`].filter(Boolean);
          rows.push(
            row({
              key: `client:${slug}:${t.id}`,
              source: 'client',
              native_key: String(t.id),
              lane: slug,
              group: 'Client work',
              phase: ph.name ?? ph.id ?? null,
              title: t.title ?? String(t.id),
              status: status3(t.status),
              raw_status: t.status ?? null,
              stage: lane.name ?? lane.id ?? null,
              priority: clientPriority(t.priority),
              due: t.due ?? null,
              owner: t.owner ?? null,
              tags: Array.isArray(t.tags) ? t.tags : [],
              deps: Array.isArray(t.dependsOn) ? t.dependsOn.map((d) => `client:${slug}:${d}`) : [],
              notes,
              subtasks: Array.isArray(t.subTasks) ? t.subTasks : [],
              sort_order: i++,
            }),
          );
        }
      }
    }
  }
  return rows;
}

// ── Main ─────────────────────────────────────────────────────────────────────────
async function main() {
  const tracker = buildTracker();
  const all = [...tracker.rows, ...buildBacklog(), ...buildClients()];

  // Dedupe by key (first wins).
  const byKey = new Map();
  const collisions = [];
  for (const r of all) {
    if (byKey.has(r.key)) {
      collisions.push(r.key);
      continue;
    }
    byKey.set(r.key, r);
  }
  const rows = [...byKey.values()];

  const tally = (sel) =>
    rows.reduce((m, r) => {
      const k = sel(r) ?? '—';
      m[k] = (m[k] ?? 0) + 1;
      return m;
    }, {});
  console.log(
    `\nNormalized ${rows.length} tasks (${all.length} parsed, ${collisions.length} collisions skipped, ${tracker.dropped} tracker rows dropped by filter${INCLUDE_ALL ? ' [--include-all]' : ''}).`,
  );
  console.log(
    'By source:',
    tally((r) => r.source),
  );
  console.log(
    'By status:',
    tally((r) => r.status),
  );
  if (collisions.length) console.log('Collisions:', collisions.slice(0, 20));

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(rows, null, 2));
  console.log(`\nWrote ${path.relative(ROOT, OUT_PATH)} (review before --write).`);

  if (!WRITE) {
    console.log('\nDry run. Re-run with --write to upsert into Supabase.');
    return;
  }

  const { getServiceClient } = await import('../lib/supabase/server.mjs');
  const sb = await getServiceClient();
  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const { error } = await sb.from('tasks').upsert(batch, { onConflict: 'key' });
    if (error) throw new Error(`upsert failed at row ${i}: ${error.message}`);
    written += batch.length;
    console.log(`  upserted ${written}/${rows.length}`);
  }
  console.log(`\nDone. ${written} tasks upserted.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
