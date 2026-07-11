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

function makeSb(
  opts: { task?: Record<string, unknown> | null; updateError?: { message: string } | null } = {},
) {
  const { task = null, updateError = null } = opts;
  const updates: Array<Record<string, unknown>> = [];
  const sb = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                single: async () =>
                  task
                    ? { data: task, error: null }
                    : { data: null, error: { message: 'not found' } },
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
    expect(await applyTaskAction(sb, { key: 't1', action: 'frobnicate' })).toMatchObject({
      status: 400,
    });
  });
});

describe('applyTaskAction — dispatch (injected GitHub port)', () => {
  const task = { key: 't1', title: 'Do it', lane: 'build', phase: null, deps: [], notes: [] };

  it('503s when no port is configured (no GITHUB_TOKEN)', async () => {
    const { sb } = makeSb({ task });
    expect(
      await applyTaskAction(sb, { key: 't1', action: 'dispatch' }, { github: null }),
    ).toMatchObject({
      status: 503,
      body: { code: 'ENV_MISSING_GITHUB_TOKEN' },
    });
  });

  it('404s when the task is missing', async () => {
    const { sb } = makeSb({ task: null });
    const github = { createIssue: async () => ({ html_url: 'x' }) };
    expect(
      await applyTaskAction(sb, { key: 'nope', action: 'dispatch' }, { github }),
    ).toMatchObject({ status: 404 });
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
    expect(result).toEqual({
      status: 200,
      body: { ok: true, dispatch_url: 'https://gh/issues/1' },
    });
    expect(calls[0].title).toContain('t1');
    expect(updates.at(-1)).toMatchObject({
      dispatch_url: 'https://gh/issues/1',
      claimed_by: 'claude',
    });
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
    expect(await applyTaskAction(sb, { key: 't1', action: 'dispatch' }, { github })).toMatchObject({
      status: 500,
    });
  });

  it('comments on the existing issue (no new issue) when the task already has a dispatch_url', async () => {
    const issued = { ...task, dispatch_url: 'https://github.com/hirobius/ops/issues/9' };
    const { sb, updates } = makeSb({ task: issued });
    const comments: Array<{ issueUrl: string; body: string }> = [];
    let created = false;
    const github = {
      createIssue: async () => {
        created = true;
        return { html_url: 'https://gh/should-not-happen' };
      },
      commentOnIssue: async (i: { issueUrl: string; body: string }) => {
        comments.push(i);
        return {};
      },
    };
    const result = await applyTaskAction(sb, { key: 't1', action: 'dispatch' }, { github });
    // Uniform one-click dispatch: reuse the existing issue, don't open a duplicate.
    expect(created).toBe(false);
    expect(comments[0].issueUrl).toBe('https://github.com/hirobius/ops/issues/9');
    expect(comments[0].body).toContain('@claude');
    expect(result).toEqual({
      status: 200,
      body: { ok: true, dispatch_url: 'https://github.com/hirobius/ops/issues/9' },
    });
    expect(updates.at(-1)).toMatchObject({
      dispatch_url: 'https://github.com/hirobius/ops/issues/9',
      claimed_by: 'claude',
      dispatch_status: 'dispatched',
    });
  });

  it('comments on source_url (no new issue) for a github-imported task with no dispatch_url yet — ops#105', async () => {
    const imported = {
      ...task,
      dispatch_url: null,
      source_url: 'https://github.com/hirobius/ops/issues/105',
    };
    const { sb, updates } = makeSb({ task: imported });
    const comments: Array<{ issueUrl: string; body: string }> = [];
    let created = false;
    const github = {
      createIssue: async () => {
        created = true;
        return { html_url: 'https://gh/should-not-happen' };
      },
      commentOnIssue: async (i: { issueUrl: string; body: string }) => {
        comments.push(i);
        return {};
      },
    };
    const result = await applyTaskAction(sb, { key: 't1', action: 'dispatch' }, { github });
    expect(created).toBe(false);
    expect(comments[0].issueUrl).toBe('https://github.com/hirobius/ops/issues/105');
    expect(result).toEqual({
      status: 200,
      body: { ok: true, dispatch_url: 'https://github.com/hirobius/ops/issues/105' },
    });
    expect(updates.at(-1)).toMatchObject({
      dispatch_url: 'https://github.com/hirobius/ops/issues/105',
      claimed_by: 'claude',
      dispatch_status: 'dispatched',
    });
  });
});

describe('applyTaskAction — ralph_ready_on/off (injected GitHub port)', () => {
  const issued = {
    key: 't1',
    title: 'Do it',
    dispatch_url: 'https://github.com/hirobius/ops/issues/9',
    tags: ['triage'],
  };

  it('503s when no port is configured (no GITHUB_TOKEN)', async () => {
    const { sb } = makeSb({ task: issued });
    expect(
      await applyTaskAction(sb, { key: 't1', action: 'ralph_ready_on' }, { github: null }),
    ).toMatchObject({ status: 503, body: { code: 'ENV_MISSING_GITHUB_TOKEN' } });
  });

  it('404s when the task is missing', async () => {
    const { sb } = makeSb({ task: null });
    const github = { addLabel: async () => ({}), removeLabel: async () => ({}) };
    expect(
      await applyTaskAction(sb, { key: 'nope', action: 'ralph_ready_on' }, { github }),
    ).toMatchObject({ status: 404 });
  });

  it('400s when the task has no linked GitHub issue', async () => {
    const { sb } = makeSb({ task: { key: 't1', title: 'Do it', dispatch_url: null, tags: [] } });
    const github = { addLabel: async () => ({}), removeLabel: async () => ({}) };
    expect(
      await applyTaskAction(sb, { key: 't1', action: 'ralph_ready_on' }, { github }),
    ).toMatchObject({ status: 400 });
  });

  it('adds the label via the port and merges it into tags', async () => {
    const { sb, updates } = makeSb({ task: issued });
    const calls: Array<{ issueUrl: string; label: string }> = [];
    const github = {
      addLabel: async (i: { issueUrl: string; label: string }) => {
        calls.push(i);
        return {};
      },
      removeLabel: async () => ({}),
    };
    const result = await applyTaskAction(sb, { key: 't1', action: 'ralph_ready_on' }, { github });
    expect(calls[0]).toEqual({
      issueUrl: 'https://github.com/hirobius/ops/issues/9',
      label: 'ralph-ready',
    });
    expect(result).toEqual({ status: 200, body: { ok: true, tags: ['triage', 'ralph-ready'] } });
    expect(updates.at(-1)).toEqual({ tags: ['triage', 'ralph-ready'] });
  });

  it('is idempotent — adding an already-present label does not duplicate it in tags', async () => {
    const alreadyOn = { ...issued, tags: ['triage', 'ralph-ready'] };
    const { sb, updates } = makeSb({ task: alreadyOn });
    const github = { addLabel: async () => ({}), removeLabel: async () => ({}) };
    const result = await applyTaskAction(sb, { key: 't1', action: 'ralph_ready_on' }, { github });
    expect(result).toEqual({ status: 200, body: { ok: true, tags: ['triage', 'ralph-ready'] } });
    expect(updates.at(-1)).toEqual({ tags: ['triage', 'ralph-ready'] });
  });

  it('removes the label via the port and drops it from tags', async () => {
    const on = { ...issued, tags: ['triage', 'ralph-ready'] };
    const { sb, updates } = makeSb({ task: on });
    const calls: Array<{ issueUrl: string; label: string }> = [];
    const github = {
      addLabel: async () => ({}),
      removeLabel: async (i: { issueUrl: string; label: string }) => {
        calls.push(i);
        return {};
      },
    };
    const result = await applyTaskAction(sb, { key: 't1', action: 'ralph_ready_off' }, { github });
    expect(calls[0]).toEqual({
      issueUrl: 'https://github.com/hirobius/ops/issues/9',
      label: 'ralph-ready',
    });
    expect(result).toEqual({ status: 200, body: { ok: true, tags: ['triage'] } });
    expect(updates.at(-1)).toEqual({ tags: ['triage'] });
  });

  it('502s when the port throws', async () => {
    const { sb } = makeSb({ task: issued });
    const github = {
      addLabel: async () => {
        throw new Error('HTTP 422');
      },
      removeLabel: async () => ({}),
    };
    const result = await applyTaskAction(sb, { key: 't1', action: 'ralph_ready_on' }, { github });
    expect(result.status).toBe(502);
    expect((result.body as { error: string }).error).toContain('422');
    expect((result.body as { code: string }).code).toBe('GITHUB_LABEL_FAILED');
  });
});
