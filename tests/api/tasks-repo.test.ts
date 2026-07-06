// @vitest-environment node
/**
 * lib/supabase/tasks.mjs — the tasks repository. A recording stub captures the
 * query shape (table, filters, ordering) so the includeDeleted branch and the
 * key-based lookups are locked against drift.
 */
import { describe, it, expect } from 'vitest';
import { listTasks, getTask, updateTask } from '../../lib/supabase/tasks.mjs';

function recordingSb(result: { data?: unknown; error?: unknown } = { data: [], error: null }) {
  const calls: { orders: Array<{ col: string; opts: unknown }> } & Record<string, unknown> = { orders: [] };
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
    single() {
      calls.single = true;
      return builder;
    },
    update(patch: unknown) {
      calls.update = patch;
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
});
