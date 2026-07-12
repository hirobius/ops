// @vitest-environment node
/**
 * lib/supabase/digests.mjs — the digest_items repository. A recording stub
 * captures the query shape (table, filters, ordering) so the includeDismissed
 * branch and the key-based lookups are locked against drift. Mirrors
 * tests/api/tasks-repo.test.ts's pattern.
 */
import { describe, it, expect } from 'vitest';
import {
  listDigestItems,
  getDigestItem,
  updateDigestItem,
  upsertDigestItems,
} from '../../lib/supabase/digests.mjs';

function recordingSb(result: { data?: unknown; error?: unknown } = { data: [], error: null }) {
  const calls: { orders: Array<{ col: string; opts: unknown }> } & Record<string, unknown> = {
    orders: [],
  };
  const builder: Record<string, unknown> = {
    select(cols: string) {
      calls.select = cols;
      return builder;
    },
    neq(col: string, val: unknown) {
      calls.neq = { col, val };
      return builder;
    },
    order(col: string, opts: unknown) {
      calls.orders.push({ col, opts });
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
      calls.upsert = rows;
      calls.upsertOpts = opts;
      return builder;
    },
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

describe('digest_items repository', () => {
  it('listDigestItems: date-desc then created_at-asc ordered, includes dismissed by default', async () => {
    const { sb, calls } = recordingSb();
    await listDigestItems(sb, { limit: 10 });
    expect(calls.table).toBe('digest_items');
    expect(calls.neq).toBeUndefined();
    expect(calls.orders).toEqual([
      { col: 'date', opts: { ascending: false } },
      { col: 'created_at', opts: { ascending: true } },
    ]);
    expect(calls.limit).toBe(10);
  });

  it('listDigestItems: includeDismissed:false filters out dismissed rows', async () => {
    const { sb, calls } = recordingSb();
    await listDigestItems(sb, { limit: 5, includeDismissed: false });
    expect(calls.neq).toEqual({ col: 'status', val: 'dismissed' });
    expect(calls.limit).toBe(5);
  });

  it('getDigestItem: selects by item_key, single row', async () => {
    const { sb, calls } = recordingSb({ data: { item_key: 'k1' }, error: null });
    await getDigestItem(sb, 'k1');
    expect(calls.eq).toEqual({ col: 'item_key', val: 'k1' });
    expect(calls.single).toBe(true);
  });

  it('updateDigestItem: patches by item_key', async () => {
    const { sb, calls } = recordingSb({ error: null });
    await updateDigestItem(sb, 'k1', { status: 'dismissed' });
    expect(calls.update).toEqual({ status: 'dismissed' });
    expect(calls.eq).toEqual({ col: 'item_key', val: 'k1' });
  });

  it('upsertDigestItems: upserts rows with onConflict: item_key', async () => {
    const { sb, calls } = recordingSb({ data: [{ item_key: '2026-07-01::a-title' }], error: null });
    const rows = [{ item_key: '2026-07-01::a-title', date: '2026-07-01', title: 'A title', status: 'new' }];
    const result = await upsertDigestItems(sb, rows);
    expect(calls.table).toBe('digest_items');
    expect(calls.upsert).toEqual(rows);
    expect(calls.upsertOpts).toEqual({ onConflict: 'item_key' });
    expect(result.error).toBeNull();
  });

  it('upsertDigestItems: no-ops on an empty/non-array input without touching the client', async () => {
    const { sb, calls } = recordingSb();
    expect(await upsertDigestItems(sb, [])).toEqual({ data: [], error: null });
    expect(calls.table).toBeUndefined();
  });
});
