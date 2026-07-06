// @vitest-environment node
/**
 * lib/tasks/actions.mjs — task mutations + the dispatch flow.
 *
 * The headline: `dispatch` is tested with a STUB GitHub port — no GITHUB_TOKEN,
 * no global fetch mock. The env read + HTTP live behind makeGitHubPort (the
 * adapter), so the orchestration here is exercised through a plain object.
 */
import { describe, it, expect } from 'vitest';
import { applyTaskAction } from '../../lib/tasks/actions.mjs';

function makeSb(opts: { task?: Record<string, unknown> | null; updateError?: { message: string } | null } = {}) {
  const { task = null, updateError = null } = opts;
  const updates: Array<Record<string, unknown>> = [];
  const sb = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                single: async () => (task ? { data: task, error: null } : { data: null, error: { message: 'not found' } }),
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            eq: async () => {
              updates.push(patch);
              return { error: updateError };
            },
          };
        },
      };
    },
  };
  return { sb: sb as never, updates };
}

describe('applyTaskAction — simple actions', () => {
  it('applies a done patch and returns 200', async () => {
    const { sb, updates } = makeSb();
    expect(await applyTaskAction(sb, { key: 't1', action: 'done' })).toEqual({
      status: 200,
      body: { ok: true, status: 'done' },
    });
    expect(updates[0]).toEqual({ status: 'done' });
  });

  it('claim stamps claimed_by from the actor', async () => {
    const { sb, updates } = makeSb();
    await applyTaskAction(sb, { key: 't1', action: 'claim', actor: 'bob' });
    expect(updates[0]).toMatchObject({ claimed_by: 'bob' });
  });

  it('400s on an unknown action', async () => {
    const { sb } = makeSb();
    expect(await applyTaskAction(sb, { key: 't1', action: 'frobnicate' })).toMatchObject({ status: 400 });
  });
});

describe('applyTaskAction — dispatch (injected GitHub port)', () => {
  const task = { key: 't1', title: 'Do it', lane: 'build', phase: null, deps: [], notes: [] };

  it('503s when no port is configured (no GITHUB_TOKEN)', async () => {
    const { sb } = makeSb({ task });
    expect(await applyTaskAction(sb, { key: 't1', action: 'dispatch' }, { github: null })).toMatchObject({
      status: 503,
      body: { code: 'ENV_MISSING_GITHUB_TOKEN' },
    });
  });

  it('404s when the task is missing', async () => {
    const { sb } = makeSb({ task: null });
    const github = { createIssue: async () => ({ html_url: 'x' }) };
    expect(await applyTaskAction(sb, { key: 'nope', action: 'dispatch' }, { github })).toMatchObject({ status: 404 });
  });

  it('opens an issue via the stub port and stamps the row — no env, no fetch', async () => {
    const { sb, updates } = makeSb({ task });
    const calls: Array<{ title: string; body: string }> = [];
    const github = {
      createIssue: async (i: { title: string; body: string }) => {
        calls.push(i);
        return { html_url: 'https://gh/issues/1' };
      },
    };
    const result = await applyTaskAction(sb, { key: 't1', action: 'dispatch' }, { github });
    expect(result).toEqual({ status: 200, body: { ok: true, dispatch_url: 'https://gh/issues/1' } });
    expect(calls[0].title).toContain('t1');
    expect(updates.at(-1)).toMatchObject({ dispatch_url: 'https://gh/issues/1', claimed_by: 'claude' });
  });

  it('502s when the port throws', async () => {
    const { sb } = makeSb({ task });
    const github = {
      createIssue: async () => {
        throw new Error('HTTP 422');
      },
    };
    const result = await applyTaskAction(sb, { key: 't1', action: 'dispatch' }, { github });
    expect(result.status).toBe(502);
    expect((result.body as { error: string }).error).toContain('422');
  });

  it('500s when the post-issue update errors', async () => {
    const { sb } = makeSb({ task, updateError: { message: 'write failed' } });
    const github = { createIssue: async () => ({ html_url: 'https://gh/issues/1' }) };
    expect(await applyTaskAction(sb, { key: 't1', action: 'dispatch' }, { github })).toMatchObject({ status: 500 });
  });
});
