/**
 * scripts/import-client-records.mjs
 *
 * Idempotent sync of the local, gitignored clients/<slug>/ JSON into the private
 * client store (Supabase client_records, migration 0015).
 *
 * Client records must never be committed to the public hirobius/ops repo. They
 * used to be JSON under clients/<slug>/ (gitignored, so they only existed on the
 * machine that wrote them) and were baked into the /ops bundle at build time.
 * The /ops client surfaces now read the private Supabase `client_records` table
 * (migration 0015) through the ClientStore port (lib/clients/store.mjs).
 *
 * The local folders are still where records are WRITTEN (by hand, and by
 * scripts/auto-assigner.mjs for tasks.json), so the store is kept in step three
 * ways:
 *   - this CLI: the bulk import. Run it once to load the initial records and
 *     again after editing clients/<slug>/ by hand. Safe to re-run at any time.
 *   - syncClientRecord({ slug }): the per-client write-through a script calls
 *     right after it edits a client folder. It never throws: a failure comes
 *     back as { ok: false, error } naming the fix, for the caller to surface.
 *   - localDrift(dir, stored): the dev server's check
 *     (scripts/clients-middleware.mjs). The client pages show this command when
 *     this machine's folders and the store disagree.
 * The store is overwritten with THIS machine's copy, so run the import on the
 * machine whose clients/ folder is current.
 *
 * It never commits, copies or prints record contents — only slugs and counts.
 *
 * Reads, per clients/<slug>/ (folders starting with `_`, e.g. _template, are
 * scaffolding and skipped):
 *   meta.json (required) · tasks.json · checklist.json · retainer.json ·
 *   goals.json · status.json · automation-config.json · brand-audit.json ·
 *   automations/<id>/config.json
 *
 * Idempotent: records are compared to the store with key order ignored; only
 * new or changed clients are written (upsert on slug). Clients in the store
 * but absent locally are left alone — this never deletes.
 *
 * Fail-loud: any malformed JSON, missing meta.json or invalid slug aborts the
 * whole run before a single write.
 *
 * Usage (Supabase env comes from .env.local, which only the human edits):
 *   node --env-file=.env.local scripts/import-client-records.mjs            # dry run
 *   node --env-file=.env.local scripts/import-client-records.mjs --apply    # write
 *   flags: --dir <path> (default: ./clients) · --json · --help
 *
 * No `#!` line on purpose: vite.config.mjs imports this module (through
 * scripts/clients-middleware.mjs), and Vite's config bundler prepends code to it,
 * which turns a shebang into a syntax error that stops `pnpm dev` / `vite preview`.
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isClientSlug, openSupabaseClientStore } from '../lib/clients/store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = path.resolve(__dirname, '../clients');
const IMPORT_COMMAND = 'node --env-file=.env.local scripts/import-client-records.mjs --apply';

/** Top-level record files: filename → ClientRecord field. */
const RECORD_FILES = [
  ['meta.json', 'meta'],
  ['tasks.json', 'tasks'],
  ['checklist.json', 'checklist'],
  ['retainer.json', 'retainer'],
  ['goals.json', 'goals'],
  ['status.json', 'status'],
  ['automation-config.json', 'automationConfig'],
  ['brand-audit.json', 'brandAudit'],
];

const errorText = (err) => (err instanceof Error ? err.message : String(err));

/**
 * Reads one clients/<slug>/ folder into a ClientRecord. Pure apart from reading `dir`.
 * @param {string} dir
 * @param {string} slug
 * @returns {{ record: object | null, problems: string[] }}
 */
function readClientFolder(dir, slug) {
  if (!isClientSlug(slug)) {
    return {
      record: null,
      problems: [`${slug}: not a valid client slug — rename the folder to lowercase kebab-case`],
    };
  }
  const folder = path.join(dir, slug);
  if (!fs.existsSync(path.join(folder, 'meta.json'))) {
    return { record: null, problems: [`${slug}: no meta.json — every client folder needs one`] };
  }
  const record = { slug };
  const problems = [];
  const readJson = (rel) => {
    try {
      // Strip a UTF-8 BOM — Windows PowerShell and Notepad add one, JSON.parse rejects it.
      return JSON.parse(fs.readFileSync(path.join(folder, rel), 'utf8').replace(/^\uFEFF/, ''));
    } catch (err) {
      problems.push(`${slug}: ${rel} is not valid JSON (${errorText(err)})`);
      return undefined;
    }
  };
  for (const [file, field] of RECORD_FILES) {
    if (!fs.existsSync(path.join(folder, file))) continue;
    const value = readJson(file);
    // A literal `null` file is "absent" — the store drops null fields, so keeping it would
    // make every re-run report a spurious update.
    if (value != null) record[field] = value;
  }
  const automations = path.join(folder, 'automations');
  if (fs.existsSync(automations)) {
    const workflows = fs
      .readdirSync(automations, { withFileTypes: true })
      .filter(
        (d) => d.isDirectory() && fs.existsSync(path.join(automations, d.name, 'config.json')),
      )
      .map((d) => d.name)
      .sort()
      .map((id) => ({ id, config: readJson(path.join('automations', id, 'config.json')) }));
    if (workflows.length > 0) record.workflows = workflows;
  }
  return problems.length > 0 ? { record: null, problems } : { record, problems };
}

/** Client folder names under `dir` (`_`-prefixed scaffolding skipped), sorted. */
function clientFolders(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name)
    .sort();
}

/**
 * Reads clients/<slug>/ folders into ClientRecords. Pure apart from reading `dir`.
 * @param {string} [dir]
 * @returns {{ records: object[], problems: string[] }}
 */
export function readLocalClientRecords(dir = DEFAULT_DIR) {
  if (!fs.existsSync(dir)) {
    return {
      records: [],
      problems: [
        `${dir} does not exist — expected one folder per client: clients/<slug>/meta.json`,
      ],
    };
  }
  const records = [];
  const problems = [];
  for (const slug of clientFolders(dir)) {
    const folder = readClientFolder(dir, slug);
    if (folder.record) records.push(folder.record);
    problems.push(...folder.problems);
  }
  return { records, problems };
}

/** Stable JSON with object keys sorted — jsonb does not preserve key order. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Which local records are new, changed, or already in the store as-is.
 * @param {object[]} local
 * @param {object[]} existing
 * @returns {{ create: string[], update: string[], unchanged: string[] }}
 */
export function planImport(local, existing) {
  const stored = new Map(existing.map((r) => [r.slug, canonical(r)]));
  const plan = { create: [], update: [], unchanged: [] };
  for (const r of local) {
    if (!stored.has(r.slug)) plan.create.push(r.slug);
    else if (stored.get(r.slug) === canonical(r)) plan.unchanged.push(r.slug);
    else plan.update.push(r.slug);
  }
  return plan;
}

/**
 * Plans against the store and, when `apply`, upserts only new/changed records.
 * @param {{ store: import('../lib/clients/store.mjs').ClientStore, records: object[], apply: boolean }} args
 */
export async function importClientRecords({ store, records, apply }) {
  const plan = planImport(records, await store.list());
  const toWrite = new Set([...plan.create, ...plan.update]);
  if (!apply || toWrite.size === 0) return { plan, written: 0 };
  await store.upsert(records.filter((r) => toWrite.has(r.slug)));
  return { plan, written: toWrite.size };
}

/**
 * Write-through for one client: push clients/<slug>/ into the store right after a
 * script edits it (scripts/auto-assigner.mjs does, for tasks.json), so
 * /ops/clients/<slug> shows the change without a manual import. Reads only that
 * client's folder, and writes only when it differs from the store.
 *
 * Never throws — the local write already happened, so a sync failure must not
 * undo or hide it. The caller surfaces `error`, which names the fix.
 *
 * @param {{ slug: string, dir?: string, openStore?: () => Promise<import('../lib/clients/store.mjs').ClientStore> }} args
 * @returns {Promise<{ ok: true, action: 'create' | 'update' | 'unchanged' } | { ok: false, error: string }>}
 */
export async function syncClientRecord({
  slug,
  dir = DEFAULT_DIR,
  openStore = openSupabaseClientStore,
}) {
  const stale =
    `/ops/clients/${slug} shows the store's older copy until this is fixed and ` +
    `\`${IMPORT_COMMAND}\` is run on this machine.`;
  const { record, problems } = readClientFolder(dir, slug);
  if (!record) return { ok: false, error: `${problems.join('; ')} — ${stale}` };
  let store;
  try {
    store = await openStore();
  } catch (err) {
    return {
      ok: false,
      error:
        `${errorText(err)} — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local ` +
        `on this machine (the bots and \`pnpm dev\` load it). ${stale}`,
    };
  }
  try {
    const { plan } = await importClientRecords({ store, records: [record], apply: true });
    const action = plan.create.length ? 'create' : plan.update.length ? 'update' : 'unchanged';
    return { ok: true, action };
  } catch (err) {
    return { ok: false, error: `${errorText(err)} — ${stale}` };
  }
}

/**
 * Does this machine's clients/ disagree with the store? Local clients that are new
 * to the store or differ from it, plus folders the import would reject. Clients
 * that exist only in the store are not drift (the import never deletes).
 *
 * @param {string} dir
 * @param {object[]} stored the store's records (ClientStore.list())
 * @returns {{ create: string[], update: string[], problems: string[] } | null}
 *   null when there are no local client folders or everything matches.
 */
export function localDrift(dir, stored) {
  if (!fs.existsSync(dir) || clientFolders(dir).length === 0) return null;
  const { records, problems } = readLocalClientRecords(dir);
  const { create, update } = planImport(records, stored);
  if (create.length === 0 && update.length === 0 && problems.length === 0) return null;
  return { create, update, problems };
}

function parseArgs(argv) {
  const o = { apply: false, json: false, help: false, dir: DEFAULT_DIR };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') o.apply = true;
    else if (arg === '--dry-run') o.apply = false;
    else if (arg === '--json') o.json = true;
    else if (arg === '--dir') o.dir = path.resolve(argv[++i] ?? '');
    else if (arg === '--help' || arg === '-h') o.help = true;
    else {
      console.error(`Unknown flag: ${arg}`);
      o.help = true;
    }
  }
  return o;
}

function printHelp() {
  console.log(
    `scripts/import-client-records.mjs — import local clients/<slug>/ JSON into the private client store\n\n` +
      `Usage:\n` +
      `  node --env-file=.env.local scripts/import-client-records.mjs [--apply] [--dir <path>] [--json]\n\n` +
      `Dry run is the DEFAULT — shows which clients would be created/updated, writes nothing.\n` +
      `--apply upserts new/changed clients into client_records (migration 0015). Never deletes.\n`,
  );
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const { records, problems } = readLocalClientRecords(args.dir);
  if (problems.length > 0) {
    fail(
      `Import aborted — nothing written. Fix these first:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
  }
  if (records.length === 0) {
    fail(
      `No client folders under ${args.dir} (only _-prefixed scaffolding). Place each client's JSON at ` +
        `clients/<slug>/meta.json (plus any tasks/checklist/retainer/goals files), then re-run.`,
    );
  }

  let store;
  try {
    store = await openSupabaseClientStore();
  } catch (err) {
    fail(
      `${errorText(err)}\nFix: run with Node's env loader so the Supabase keys are present — ` +
        `\`node --env-file=.env.local scripts/import-client-records.mjs\` (SUPABASE_URL + ` +
        `SUPABASE_SERVICE_ROLE_KEY must be set in .env.local).`,
    );
  }

  let result;
  try {
    result = await importClientRecords({ store, records, apply: args.apply });
  } catch (err) {
    fail(`Import failed — ${errorText(err)}`);
  }

  const { plan, written } = result;
  if (args.json) {
    console.log(
      JSON.stringify({ apply: args.apply, found: records.length, written, plan }, null, 2),
    );
  } else {
    console.log(`Client folders found: ${records.length}`);
    console.log(`  create:    ${plan.create.join(', ') || '—'}`);
    console.log(`  update:    ${plan.update.join(', ') || '—'}`);
    console.log(`  unchanged: ${plan.unchanged.join(', ') || '—'}`);
    console.log(
      args.apply
        ? `\nWrote ${written} client record(s).`
        : `\nDry run — no writes. Re-run with --apply to import.`,
    );
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => fail(e?.stack || String(e)));
}
