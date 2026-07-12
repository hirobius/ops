// @vitest-environment node
/**
 * api/tasks.ts's tasksHandler — GET /api/tasks now also resolves live
 * dispatch status (ops#107) via lib/tasks/dispatch-status.mjs before
 * responding. Exercised with a STUB GitHub port + a stub Supabase client (no
 * env, no fetch, no DB — same injection pattern as import-issues-handler.test.ts).
 */
import { describe, it, expect, vi } from 'vitest';
import { tasksHandler } from '../../api/tasks';

function makeSb(rows: unknown[], updateError: { message: string } | null = null) {
  const updateCalls: Array<{ key: string; patch: unknown }> = [];
  let pendingPatch: unknown;
  const sb = {
    from() {
      const builder: Record<string, unknown> = {
        select() {
          return builder;
        },
        is() {
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        update(patch: unknown) {
          pendingPatch = patch;
          return builder;
        },
        eq(_col: string, val: string) {
          updateCalls.push({ key: val, patch: pendingPatch });
          pendingPatch = undefined;
          return Promise.resolve({ data: null, error: updateError });
        },
        then(resolve: (r: unknown) => unknown) {
          return resolve({ data: rows, error: null });
        },
      };
      return builder;
    },
  };
  return { sb: sb as never, updateCalls };
}

function task(overrides: Record<string, unknown> = {}) {
  return {
    key: 'github:hirobius/ops#42',
    status: 'open',
    dispatch_status: 'dispatched',
    completed_at: null,
    pr_url: null,
    ...overrides,
  };
}

const req = { query: {} } as never;

describe('tasksHandler — live dispatch-status resolution', () => {
  it('moves a dispatched task with an open linked PR to running and persists the write', async () => {
    const { sb, updateCalls } = makeSb([task()]);
    const github = {
      getLinkedPullRequest: vi.fn(async () => [
        {
          number: 9,
          url: 'https://github.com/hirobius/ops/pull/9',
          state: 'open',
          merged: false,
          created_at: '2026-07-12T00:00:00.000Z',
        },
      ]),
    };

    const result = await tasksHandler(sb, req, { github: github as never, now: 1_752_321_600_000 });

    expect(result.status).toBe(200);
    const body = result.body as { tasks: Array<Record<string, unknown>> };
    expect(body.tasks[0]).toMatchObject({
      dispatch_status: 'running',
      pr_url: 'https://github.com/hirobius/ops/pull/9',
    });
    expect(updateCalls).toEqual([
      {
        key: 'github:hirobius/ops#42',
        patch: { dispatch_status: 'running', pr_url: 'https://github.com/hirobius/ops/pull/9' },
      },
    ]);
  });

  it('passes tasks through unchanged when no GitHub port is available (no GITHUB_TOKEN)', async () => {
    const { sb, updateCalls } = makeSb([task()]);

    const result = await tasksHandler(sb, req, { github: null, now: 1_752_321_600_000 });

    expect(result.status).toBe(200);
    const body = result.body as { tasks: Array<Record<string, unknown>> };
    expect(body.tasks).toEqual([task()]);
    expect(updateCalls).toEqual([]);
  });

  it('leaves non-dispatched tasks untouched and does not call the GitHub port for them', async () => {
    const { sb } = makeSb([task({ key: 'github:hirobius/ops#1', dispatch_status: 'done', status: 'done' })]);
    const github = { getLinkedPullRequest: vi.fn() };

    const result = await tasksHandler(sb, req, { github: github as never, now: 1_752_321_600_000 });

    expect(result.status).toBe(200);
    expect(github.getLinkedPullRequest).not.toHaveBeenCalled();
  });
});
