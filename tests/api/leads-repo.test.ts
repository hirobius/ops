// @vitest-environment node
/**
 * lib/supabase/leads.mjs — the leads repository.
 *
 * A recording stub captures the query the repo builds (table, columns, order,
 * filters, upsert opts), so a column rename or a dropped `onConflict` is caught
 * here instead of silently in prod. The builder is a thenable, like the real
 * Supabase one, so `await`ing any chain resolves a result.
 */
import { describe, it, expect } from 'vitest';
import { listLeads, getLead, updateLead, upsertLeads } from '../../lib/supabase/leads.mjs';

function recordingSb(result: { data?: unknown; error?: unknown } = { data: [], error: null }) {
  const calls: Record<string, unknown> = {};
  const builder: Record<string, unknown> = {
    select(cols: string) {
      calls.select = cols;
      return builder;
    },
    order(col: string, opts: unknown) {
      calls.order = { col, opts };
      return builder;
    },
    limit(n: number) {
      calls.limit = n;
      return builder;
    },
    eq(col: string, val: unknown) {
      calls.eq = { col, val };
      return builder;
    },
    single() {
      calls.single = true;
      return builder;
    },
    update(patch: unknown) {
      calls.update = patch;
      return builder;
    },
    upsert(rows: unknown, opts: unknown) {
      calls.upsert = { rows, opts };
      return builder;
    },
    // Thenable: awaiting any chain resolves the result.
    then(resolve: (r: unknown) => unknown) {
      return resolve(result);
    },
  };
  const sb = {
    from(table: string) {
      calls.table = table;
      return builder;
    },
  };
  return { sb: sb as never, calls };
}

describe('leads repository', () => {
  it('listLeads: leads table, newest-first, limited', async () => {
    const { sb, calls } = recordingSb();
    await listLeads(sb, 50);
    expect(calls.table).toBe('leads');
    expect(calls.select).toBe('*');
    expect(calls.order).toEqual({ col: 'created_at', opts: { ascending: false } });
    expect(calls.limit).toBe(50);
  });

  it('getLead: select by id, single row', async () => {
    const { sb, calls } = recordingSb({ data: { id: 'abc' }, error: null });
    const { data } = await getLead(sb, 'abc');
    expect(calls.eq).toEqual({ col: 'id', val: 'abc' });
    expect(calls.single).toBe(true);
    expect(data).toEqual({ id: 'abc' });
  });

  it('updateLead: patch by id', async () => {
    const { sb, calls } = recordingSb({ error: null });
    await updateLead(sb, 'abc', { status: 'scored' });
    expect(calls.update).toEqual({ status: 'scored' });
    expect(calls.eq).toEqual({ col: 'id', val: 'abc' });
  });

  it('upsertLeads: keyed on place_id', async () => {
    const { sb, calls } = recordingSb({ error: null });
    await upsertLeads(sb, [{ place_id: 'p1' }]);
    expect(calls.upsert).toEqual({ rows: [{ place_id: 'p1' }], opts: { onConflict: 'place_id' } });
  });
});
