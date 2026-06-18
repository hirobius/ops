/**
 * scripts/import-tasks.mjs — consolidate all tasks into the Supabase `tasks` table.
 *
 * Sources (each namespaced so keys never collide):
 *   - tracker  : the ops-archive export JSON (drop at data/tracker-tasks.export.json,
 *                or pass --tracker <path>). Keys prefixed `tracker:`.
 *   - backlog  : this repo's BACKLOG.md.            Keys prefixed `backlog:`.
 *   - client:<slug> : clients/<slug>/tasks.json.    Keys prefixed `client:<slug>:`.
 *
 * Usage:
 *   node scripts/import-tasks.mjs                 # dry run → writes data/tasks.normalized.json + prints summary
 *   node scripts/import-tasks.mjs --tracker path  # use a specific tracker export
 *   node scripts/import-tasks.mjs --write         # upsert into Supabase (needs SUPABASE_* env)
 *
 * Idempotent: upserts on `key`. Re-running is safe. Dry run by default — review the
 * normalized output before --write. See docs/operations/tasks-consolidation.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const trackerArg = args[args.indexOf('--tracker') + 1];
const TRACKER_PATH = path.resolve(
  ROOT,
  args.includes('--tracker') && trackerArg ? trackerArg : 'data/tracker-tasks.export.json',
);
const OUT_PATH = path.resolve(ROOT, 'data/tasks.normalized.json');

// ── Status normalization ───────────────────────────────────────────────────────
const STATUS_MAP = {
  // backlog badges
  ready: 'ready', blocked: 'blocked', parked: 'parked', 'needs-grilling': 'triage', idea: 'idea',
  // client tasks
  done: 'done', todo: 'todo', 'in-progress': 'in_progress', inprogress: 'in_progress',
  // common / tracker
  triage: 'triage', running: 'in_progress', archived: 'archived',
};
function normStatus(raw) {
  if (!raw) return 'todo';
  const k = String(raw).trim().toLowerCase();
  return STATUS_MAP[k] ?? k.replace(/[\s-]+/g, '_');
}

// ── Source: BACKLOG.md ─────────────────────────────────────────────────────────
function parseBacklog() {
  const file = path.join(ROOT, 'BACKLOG.md');
  if (!fs.existsSync(file)) return [];
  const rows = [];
  let area = null;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const h = line.match(/^##\s+(.+?)(?:\s+_\(\d+\)_)?\s*$/);
    if (h) { area = h[1].trim(); continue; }
    // item: - `status` **id** — title…   (legend lines have no **id** → skipped)
    const m = line.match(/^- `([a-z-]+)` \*\*([^*]+)\*\* — (.*)$/);
    if (!m) continue;
    const [, status, id, rest] = m;
    rows.push({
      key: `backlog:${id.trim()}`,
      source: 'backlog',
      title: rest.trim(),
      body: null,
      status: normStatus(status),
      area,
      lane: null,
      priority: null,
      due: null,
      owner: null,
      tags: null,
      sub_tasks: null,
      depends_on: null,
      meta: { id: id.trim(), badge: status },
    });
  }
  return rows;
}

// ── Source: clients/*/tasks.json ───────────────────────────────────────────────
function parseClients() {
  const dir = path.join(ROOT, 'clients');
  if (!fs.existsSync(dir)) return [];
  const rows = [];
  for (const slug of fs.readdirSync(dir)) {
    if (slug === '_template') continue;
    const file = path.join(dir, slug, 'tasks.json');
    if (!fs.existsSync(file)) continue;
    let json;
    try { json = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    for (const phase of json.phases ?? []) {
      for (const lane of phase.swimlanes ?? []) {
        for (const t of lane.tasks ?? []) {
          const body = [t.notes, t.blockedReason && `Blocked: ${t.blockedReason}`]
            .filter(Boolean).join('\n') || null;
          rows.push({
            key: `client:${slug}:${t.id}`,
            source: `client:${slug}`,
            title: t.title ?? String(t.id),
            body,
            status: normStatus(t.status),
            area: phase.name ?? phase.id ?? null,
            lane: lane.name ?? lane.id ?? null,
            priority: typeof t.priority === 'number' ? t.priority : null,
            due: t.due ?? null,
            owner: t.owner ?? null,
            tags: Array.isArray(t.tags) ? t.tags : null,
            sub_tasks: Array.isArray(t.subTasks) ? t.subTasks : null,
            depends_on: Array.isArray(t.dependsOn) ? t.dependsOn : null,
            meta: t,
          });
        }
      }
    }
  }
  return rows;
}

// ── Source: tracker export (ops-archive) ───────────────────────────────────────
function parseTracker() {
  if (!fs.existsSync(TRACKER_PATH)) {
    console.warn(`! tracker export not found at ${path.relative(ROOT, TRACKER_PATH)} — skipping (drop the handoff export there).`);
    return [];
  }
  let json;
  try { json = JSON.parse(fs.readFileSync(TRACKER_PATH, 'utf8')); } catch (e) {
    console.warn(`! could not parse tracker export: ${e.message}`);
    return [];
  }
  const list = Array.isArray(json) ? json : (json.tasks ?? []);
  return list.map((t) => {
    const rawKey = t.key ?? t.id ?? cryptoRandom();
    const key = String(rawKey).startsWith('tracker:') ? String(rawKey) : `tracker:${rawKey}`;
    return {
      key,
      source: 'tracker',
      title: t.title ?? String(t.id ?? key),
      body: t.notes ?? t.body ?? null,
      status: normStatus(t.status),
      area: t.area ?? t.laneGroup ?? null,
      lane: t.lane ?? null,
      priority: typeof t.priority === 'number' ? t.priority : null,
      due: t.due ?? null,
      owner: t.owner ?? null,
      tags: Array.isArray(t.tags) ? t.tags : null,
      sub_tasks: Array.isArray(t.subTasks) ? t.subTasks : (Array.isArray(t.sub_tasks) ? t.sub_tasks : null),
      depends_on: Array.isArray(t.dependsOn) ? t.dependsOn : (Array.isArray(t.depends_on) ? t.depends_on : null),
      archived: t.archived === true || normStatus(t.status) === 'archived',
      deleted_at: t.deletedAt ?? t.deleted_at ?? null,
      meta: t,
    };
  });
}

function cryptoRandom() {
  return Math.random().toString(36).slice(2, 10);
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const all = [...parseTracker(), ...parseBacklog(), ...parseClients()];

  // Dedupe by key (first wins; warn on collisions).
  const byKey = new Map();
  const collisions = [];
  for (const row of all) {
    if (byKey.has(row.key)) { collisions.push(row.key); continue; }
    byKey.set(row.key, row);
  }
  const rows = [...byKey.values()];

  // Summary.
  const bySource = {};
  const byStatus = {};
  for (const r of rows) {
    bySource[r.source.replace(/^(client):.*/, '$1:*')] = (bySource[r.source.replace(/^(client):.*/, '$1:*')] ?? 0) + 1;
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  }
  console.log(`\nNormalized ${rows.length} tasks (${all.length} parsed, ${collisions.length} key collisions skipped).`);
  console.log('By source:', bySource);
  console.log('By status:', byStatus);
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
    const batch = rows.slice(i, i + CHUNK).map((r) => ({ ...r, updated_at: new Date().toISOString() }));
    const { error } = await sb.from('tasks').upsert(batch, { onConflict: 'key' });
    if (error) throw new Error(`upsert failed at row ${i}: ${error.message}`);
    written += batch.length;
    console.log(`  upserted ${written}/${rows.length}`);
  }
  console.log(`\nDone. ${written} tasks upserted into Supabase.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
