/**
 * lib/clients/store.mjs — the ClientStore port: where client records live.
 *
 * Client records (identity, contact, retainer, tasks, automations, brand audit)
 * are business-confidential and often carry PII, so they must never be committed
 * to the public hirobius/ops repo. The app reads them from the private Supabase
 * `client_records` table (migration 0015). Public code and fixtures only ever use
 * pseudonymous slugs (client-alpha, client-beta, …).
 *
 * The port is two operations over plain records:
 *
 *   list()            → ClientRecord[]  (slug order, deep copies)
 *   upsert(records)   → void            (idempotent, keyed on slug)
 *
 * Adapters:
 *   createSupabaseClientStore(sb)   production — sb is the service-role client
 *                                   from lib/supabase/server.mjs (server only).
 *   openSupabaseClientStore()       the same, acquiring that client from env —
 *                                   for scripts and the dev middleware.
 *   createMemoryClientStore(seed)   tests and local reasoning — same contract,
 *                                   locked by tests/api/client-store.test.ts.
 *
 * Failures are thrown as ClientStoreError with a stable `code`, an HTTP `status`
 * and a message that names the fix (repo convention: fail loud and actionable).
 *
 * @typedef {{ id: string, config: Record<string, unknown> }} ClientWorkflowRecord
 * @typedef {object} ClientRecord
 * @property {string} slug                      pseudonymous, lowercase-kebab, never `_`-prefixed
 * @property {Record<string, unknown>} meta     meta.json (required)
 * @property {object} [tasks]                   tasks.json
 * @property {object} [checklist]               checklist.json
 * @property {object} [retainer]                retainer.json
 * @property {object} [goals]                   goals.json
 * @property {object} [status]                  status.json
 * @property {object} [automationConfig]        automation-config.json
 * @property {ClientWorkflowRecord[]} [workflows] automations/<id>/config.json
 * @property {object} [brandAudit]              brand-audit.json
 *
 * @typedef {{ list(): Promise<ClientRecord[]>, upsert(records: ClientRecord[]): Promise<void> }} ClientStore
 */

export const CLIENT_RECORDS_TABLE = 'client_records';
const CLIENT_RECORDS_MIGRATION = 'supabase/migrations/0015_client_records.sql';
const SUPABASE_SQL_EDITOR_URL =
  'https://supabase.com/dashboard/project/vvyccwxtcwvlusweenje/sql/new';
const IMPORT_COMMAND = 'node --env-file=.env.local scripts/import-client-records.mjs --apply';

/** Lowercase kebab slug; a leading `_` marks scaffolding (clients/_template), never a record. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Optional record fields ↔ their snake_case column. `meta` and `slug` are required. */
const OPTIONAL_FIELDS = /** @type {const} */ ([
  ['tasks', 'tasks'],
  ['checklist', 'checklist'],
  ['retainer', 'retainer'],
  ['goals', 'goals'],
  ['status', 'status'],
  ['automationConfig', 'automation_config'],
  ['workflows', 'workflows'],
  ['brandAudit', 'brand_audit'],
]);

const COLUMNS = ['slug', 'meta', ...OPTIONAL_FIELDS.map(([, col]) => col)].join(',');

export class ClientStoreError extends Error {
  /**
   * @param {string} code
   * @param {number} status
   * @param {string} message
   */
  constructor(code, status, message) {
    super(`${code}: ${message}`);
    this.name = 'ClientStoreError';
    this.code = code;
    this.status = status;
  }
}

/** True when `slug` is a storable (pseudonymous, non-scaffold) client slug. */
export function isClientSlug(slug) {
  return typeof slug === 'string' && SLUG_RE.test(slug);
}

/** @param {unknown} record */
function assertRecord(record) {
  const r = /** @type {Record<string, unknown>} */ (record ?? {});
  if (!isClientSlug(r.slug)) {
    throw new ClientStoreError(
      'CLIENT_RECORD_INVALID',
      400,
      `slug ${JSON.stringify(r.slug)} is not a client slug — use lowercase kebab-case ` +
        '(e.g. client-alpha); `_`-prefixed folders are scaffolding and are never stored.',
    );
  }
  if (!r.meta || typeof r.meta !== 'object' || Array.isArray(r.meta)) {
    throw new ClientStoreError(
      'CLIENT_RECORD_INVALID',
      400,
      `record ${r.slug} has no meta object — every client needs a meta.json.`,
    );
  }
}

/** JSON deep copy — records are plain JSON by construction. */
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Drop absent optional fields (and empty workflow lists) so both adapters agree on shape. */
function normalise(record) {
  /** @type {Record<string, unknown>} */
  const out = { slug: record.slug, meta: clone(record.meta) };
  for (const [field] of OPTIONAL_FIELDS) {
    const v = record[field];
    if (v == null) continue;
    if (field === 'workflows' && Array.isArray(v) && v.length === 0) continue;
    out[field] = clone(v);
  }
  return /** @type {ClientRecord} */ (out);
}

/** ClientRecord → client_records row (camelCase fields → snake_case columns, absent → null). */
function rowFromRecord(record) {
  /** @type {Record<string, unknown>} */
  const row = { slug: record.slug, meta: record.meta };
  for (const [field, col] of OPTIONAL_FIELDS) row[col] = record[field] ?? null;
  return row;
}

/** client_records row → ClientRecord. */
function recordFromRow(row) {
  /** @type {Record<string, unknown>} */
  const record = { slug: row.slug, meta: row.meta };
  for (const [field, col] of OPTIONAL_FIELDS) record[field] = row[col];
  return normalise(record);
}

const bySlug = (a, b) => a.slug.localeCompare(b.slug);

/**
 * In-memory adapter. Same contract as the Supabase adapter.
 * @param {ClientRecord[]} [seed]
 * @returns {ClientStore}
 */
export function createMemoryClientStore(seed = []) {
  /** @type {Map<string, ClientRecord>} */
  const records = new Map();
  for (const r of seed) {
    assertRecord(r);
    records.set(r.slug, normalise(r));
  }
  return {
    async list() {
      return [...records.values()].map(clone).sort(bySlug);
    },
    async upsert(incoming) {
      incoming.forEach(assertRecord);
      for (const r of incoming) records.set(r.slug, normalise(r));
    },
  };
}

/** PostgREST PGRST205 ("schema cache") or Postgres 42P01 (undefined_table). */
function isMissingTable(error) {
  if (error?.code === 'PGRST205' || error?.code === '42P01') return true;
  return (
    /client_records/.test(error?.message ?? '') &&
    /does not exist|could not find/i.test(error.message)
  );
}

function toStoreError(error, op) {
  if (isMissingTable(error)) {
    return new ClientStoreError(
      'CLIENT_RECORDS_TABLE_MISSING',
      503,
      `the ${CLIENT_RECORDS_TABLE} table does not exist yet. Apply ${CLIENT_RECORDS_MIGRATION} ` +
        `in the Supabase SQL editor (${SUPABASE_SQL_EDITOR_URL}), then import the local ` +
        `client records with \`${IMPORT_COMMAND}\`.`,
    );
  }
  return new ClientStoreError(
    'CLIENT_RECORDS_QUERY_FAILED',
    500,
    `${op} on ${CLIENT_RECORDS_TABLE} failed: ${error?.message ?? String(error)}`,
  );
}

/**
 * Supabase adapter over the `client_records` table (migration 0015).
 * @param {import('@supabase/supabase-js').SupabaseClient} sb service-role client (server only)
 * @returns {ClientStore}
 */
export function createSupabaseClientStore(sb) {
  return {
    async list() {
      const { data, error } = await sb
        .from(CLIENT_RECORDS_TABLE)
        .select(COLUMNS)
        .order('slug', { ascending: true });
      if (error) throw toStoreError(error, 'select');
      return (data ?? []).map(recordFromRow).sort(bySlug);
    },
    async upsert(incoming) {
      incoming.forEach(assertRecord);
      if (incoming.length === 0) return;
      const rows = incoming.map((r) => rowFromRecord(normalise(r)));
      const { error } = await sb.from(CLIENT_RECORDS_TABLE).upsert(rows, { onConflict: 'slug' });
      if (error) throw toStoreError(error, 'upsert');
    },
  };
}

/**
 * The Supabase adapter with its service-role client taken from env (scripts and
 * the dev middleware; api/ functions get the client from withServiceClient).
 * Throws SUPABASE_MISSING_ENV (naming the variables) when the env is unset.
 * lib/supabase/server.mjs is imported lazily so this module stays importable
 * without supabase-js or env (tests, the memory adapter).
 * @returns {Promise<ClientStore>}
 */
export async function openSupabaseClientStore() {
  const { getServiceClient } = await import('../supabase/server.mjs');
  return createSupabaseClientStore(await getServiceClient());
}
