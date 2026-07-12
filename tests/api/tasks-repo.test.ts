// @vitest-environment node
/**
 * lib/supabase/tasks.mjs — the tasks repository. A recording stub captures the
 * query shape (table, filters, ordering) so the includeDeleted branch and the
 * key-based lookups are locked against drift.
 */
import { describe, it, expect } from 'vitest';
import {
  listTasks,
  getTask,
  updateTask,
  upsertTasks,
  listGithubTaskKeys,
  retireTasks,
} from '../../lib/supabase/tasks.mjs';

function recordingSb(result: { data?: unknown; error?: unknown } = { data: [], error: null }) {
  const calls: { orders: Array<{ col: string; opts: unknown }> } & Record<string, unknown> = {
    orders: [],
  };
  const builder: Record<string, unknown> = {
    select(cols: string) {
      calls.select = cols;
      return builder;
    },
    is(col: string, val: unknown) {
      calls.is = { col, val };
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
    like(col: string, val: unknown) {
      calls.like = { col, val };
      return builder;
    },
    neq(col: string, val: unknown) {
      calls.neq = { col, val };
      return builder;
    },
    in(col: string, vals: unknown) {
      calls.in = { col, vals };
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

describe('tasks repository', () => {
  it('listTasks: excludes soft-deleted by default, status- then sort-ordered', async () => {
    const { sb, calls } = recordingSb();
    await listTasks(sb, { limit: 10 });
    expect(calls.table).toBe('tasks');
    expect(calls.is).toEqual({ col: 'deleted_at', val: null });
    expect(calls.orders).toEqual([
      { col: 'status', opts: { ascending: true } },
      { col: 'sort_order', opts: { ascending: true } },
    ]);
    expect(calls.limit).toBe(10);
  });

  it('listTasks: includeDeleted skips the deleted_at filter', async () => {
    const { sb, calls } = recordingSb();
    await listTasks(sb, { limit: 5, includeDeleted: true });
    expect(calls.is).toBeUndefined();
    expect(calls.limit).toBe(5);
  });

  it('getTask: selects by key, single row', async () => {
    const { sb, calls } = recordingSb({ data: { key: 'k1' }, error: null });
    await getTask(sb, 'k1');
    expect(calls.eq).toEqual({ col: 'key', val: 'k1' });
    expect(calls.single).toBe(true);
  });

  it('updateTask: patches by key', async () => {
    const { sb, calls } = recordingSb({ error: null });
    await updateTask(sb, 'k1', { status: 'done' });
    expect(calls.update).toEqual({ status: 'done' });
    expect(calls.eq).toEqual({ col: 'key', val: 'k1' });
  });

  it('upsertTasks: upserts rows with onConflict: key', async () => {
    const { sb, calls } = recordingSb({ data: [{ key: 'github:hirobius/ops#1' }], error: null });
    const rows = [
      {
        key: 'github:hirobius/ops#1',
        source: 'github:hirobius/ops',
        title: 'Do it',
        lane: 'ops',
        status: 'open',
      },
    ];
    const result = await upsertTasks(sb, rows);
    expect(calls.table).toBe('tasks');
    expect(calls.upsert).toEqual(rows);
    expect(calls.upsertOpts).toEqual({ onConflict: 'key' });
    expect(result.error).toBeNull();
  });

  it('upsertTasks: no-ops on an empty/non-array input without touching the client', async () => {
    const { sb, calls } = recordingSb();
    expect(await upsertTasks(sb, [])).toEqual({ data: [], error: null });
    expect(calls.table).toBeUndefined();
  });

  it('listGithubTaskKeys: scopes to github:* sources, excludes deleted + done', async () => {
    const { sb, calls } = recordingSb({ data: [{ key: 'github:hirobius/ops#1' }], error: null });
    await listGithubTaskKeys(sb);
    expect(calls.table).toBe('tasks');
    expect(calls.select).toBe('key');
    expect(calls.like).toEqual({ col: 'source', val: 'github:%' });
    expect(calls.is).toEqual({ col: 'deleted_at', val: null });
    expect(calls.neq).toEqual({ col: 'status', val: 'done' });
  });

  it('retireTasks: patches status to done for the given keys', async () => {
    const { sb, calls } = recordingSb({ error: null });
    await retireTasks(sb, ['github:hirobius/hirobius-design-system#1']);
    expect(calls.table).toBe('tasks');
    expect(calls.update).toEqual({ status: 'done' });
    expect(calls.in).toEqual({ col: 'key', vals: ['github:hirobius/hirobius-design-system#1'] });
  });

  it('retireTasks: no-ops on an empty key list without touching the client', async () => {
    const { sb, calls } = recordingSb();
    expect(await retireTasks(sb, [])).toEqual({ data: [], error: null });
    expect(calls.table).toBeUndefined();
  });
});
