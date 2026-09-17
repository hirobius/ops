// @vitest-environment node
/**
 * lib/clients/store.mjs — the ClientStore port (client records are read from the
 * private Supabase `client_records` table, never committed to this repo).
 *
 * One contract suite runs against BOTH adapters: the in-memory adapter (what
 * tests and the import script's dry runs use) and the Supabase adapter driven
 * through a fake PostgREST table. If the two ever disagree on behaviour, the
 * seam is lying — this suite is what keeps it honest.
 *
 * All data is synthetic (client-alpha / client-beta, example.com, 555-0100).
 */
import { describe, it, expect } from 'vitest';
import {
  createMemoryClientStore,
  createSupabaseClientStore,
  CLIENT_RECORDS_TABLE,
} from '../../lib/clients/store.mjs';

type Row = Record<string, unknown>;

/** A fake Supabase client backed by an in-memory table, for the adapter contract. */
function fakeSupabase(opts: { error?: { code?: string; message: string } } = {}) {
  const tables: Record<string, Row[]> = { [CLIENT_RECORDS_TABLE]: [] };
  const calls: string[] = [];
  const sb = {
    from(table: string) {
      calls.push(`from:${table}`);
      const rows = tables[table];
      let ordered: Row[] | null = null;
      const q = {
        select(cols: string) {
          calls.push(`select:${cols}`);
          ordered = rows ? [...rows] : [];
          return q;
        },
        order(col: string, o: { ascending: boolean }) {
          calls.push(`order:${col}`);
          ordered = [...(ordered ?? [])].sort(
            (a, b) => String(a[col]).localeCompare(String(b[col])) * (o.ascending ? 1 : -1),
          );
          return q;
        },
        upsert(incoming: Row[], o: { onConflict: string }) {
          calls.push(`upsert:${o.onConflict}`);
          if (!opts.error && rows) {
            for (const r of incoming) {
              const i = rows.findIndex((x) => x[o.onConflict] === r[o.onConflict]);
              if (i >= 0) rows[i] = { ...rows[i], ...r };
              else rows.push({ ...r });
            }
          }
          return Promise.resolve(opts.error ? { error: opts.error } : { error: null });
        },
        then(resolve: (r: unknown) => unknown) {
          if (opts.error) return resolve({ data: null, error: opts.error });
          return resolve({ data: JSON.parse(JSON.stringify(ordered ?? [])), error: null });
        },
      };
      return q;
    },
  };
  return { sb: sb as never, tables, calls };
}

const alpha = {
  slug: 'client-alpha',
  meta: {
    id: 'client-alpha',
    name: 'Jane Example Co',
    status: 'active',
    contact: { name: 'Jane Example', email: 'jane@example.com', phone: '555-0100' },
    services: ['automation'],
  },
  tasks: { phases: [] },
  retainer: {
    model: 'retainer',
    currentPhase: { phase: 'phase-1', status: 'active', currency: 'USD', scopedAt: 1200 },
  },
  automationConfig: { mode: 'test' },
  workflows: [{ id: 'lead-intake', config: { id: 'lead-intake' } }],
};
const beta = {
  slug: 'client-beta',
  meta: { id: 'client-beta', name: 'Example Prospect LLC', status: 'prospect' },
};

const adapters = [
  { name: 'memory', make: () => createMemoryClientStore() },
  { name: 'supabase', make: () => createSupabaseClientStore(fakeSupabase().sb) },
];

describe.each(adapters)('ClientStore contract — $name adapter', ({ make }) => {
  it('starts empty', async () => {
    const store = make();
    expect(await store.list()).toEqual([]);
  });

  it('round-trips records, listed in slug order, optional files omitted when absent', async () => {
    const store = make();
    await store.upsert([beta, alpha]);
    expect(await store.list()).toEqual([alpha, beta]);
  });

  it('upsert is idempotent and replaces a record by slug', async () => {
    const store = make();
    await store.upsert([alpha]);
    await store.upsert([alpha]);
    const renamed = { ...alpha, meta: { ...alpha.meta, name: 'Renamed Example Co' } };
    await store.upsert([renamed]);
    const listed = await store.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].meta.name).toBe('Renamed Example Co');
  });

  it('rejects a scaffold or malformed slug before writing anything', async () => {
    const store = make();
    await expect(store.upsert([{ ...alpha, slug: '_template' }])).rejects.toMatchObject({
      code: 'CLIENT_RECORD_INVALID',
    });
    await expect(store.upsert([{ ...alpha, slug: 'Has Spaces' }])).rejects.toMatchObject({
      code: 'CLIENT_RECORD_INVALID',
    });
    await expect(store.upsert([{ slug: 'client-gamma' } as never])).rejects.toMatchObject({
      code: 'CLIENT_RECORD_INVALID',
    });
    expect(await store.list()).toEqual([]);
  });

  it('hands out copies — mutating a listed record does not change the store', async () => {
    const store = make();
    await store.upsert([alpha]);
    const [first] = await store.list();
    first.meta.name = 'mutated';
    const [again] = await store.list();
    expect(again.meta.name).toBe('Jane Example Co');
  });
});

describe('Supabase adapter — storage shape and fail-loud errors', () => {
  it('stores camelCase record fields in snake_case columns', async () => {
    const fake = fakeSupabase();
    await createSupabaseClientStore(fake.sb).upsert([alpha]);
    const [row] = fake.tables[CLIENT_RECORDS_TABLE];
    expect(row.automation_config).toEqual({ mode: 'test' });
    expect(row.brand_audit).toBeNull();
    expect('automationConfig' in row).toBe(false);
  });

  it('a missing table names the migration, the SQL editor and the import step', async () => {
    const fake = fakeSupabase({
      error: {
        code: 'PGRST205',
        message: "Could not find the table 'public.client_records' in the schema cache",
      },
    });
    const store = createSupabaseClientStore(fake.sb);
    const err = await store.list().catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'CLIENT_RECORDS_TABLE_MISSING', status: 503 });
    const msg = (err as Error).message;
    expect(msg).toContain('supabase/migrations/0015_client_records.sql');
    expect(msg).toContain('https://supabase.com/dashboard/project/vvyccwxtcwvlusweenje/sql/new');
    expect(msg).toContain('scripts/import-client-records.mjs');
  });

  it('recognises the raw Postgres undefined-table code too', async () => {
    const fake = fakeSupabase({
      error: { code: '42P01', message: 'relation "client_records" does not exist' },
    });
    await expect(createSupabaseClientStore(fake.sb).list()).rejects.toMatchObject({
      code: 'CLIENT_RECORDS_TABLE_MISSING',
    });
  });

  it('any other query failure is a 500 carrying the upstream message', async () => {
    const fake = fakeSupabase({ error: { code: 'XX000', message: 'boom' } });
    const err = await createSupabaseClientStore(fake.sb)
      .upsert([alpha])
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'CLIENT_RECORDS_QUERY_FAILED', status: 500 });
    expect((err as Error).message).toContain('boom');
  });
});
