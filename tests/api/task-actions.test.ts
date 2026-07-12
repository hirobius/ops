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

  it('stamps last_dispatched_at and bumps dispatch_count — ops#139, the one seam every dispatch source shares', async () => {
    const { sb, updates } = makeSb({ task: { ...task, dispatch_count: 2 } });
    const github = { createIssue: async () => ({ html_url: 'https://gh/issues/1' }) };
    await applyTaskAction(sb, { key: 't1', action: 'dispatch' }, { github });
    expect(updates.at(-1)).toMatchObject({ dispatch_count: 3 });
    expect(typeof (updates.at(-1) as Record<string, unknown>).last_dispatched_at).toBe('string');
  });

  it('treats a missing dispatch_count as 0 before bumping', async () => {
    const { sb, updates } = makeSb({ task });
    const github = { createIssue: async () => ({ html_url: 'https://gh/issues/1' }) };
    await applyTaskAction(sb, { key: 't1', action: 'dispatch' }, { github });
    expect(updates.at(-1)).toMatchObject({ dispatch_count: 1 });
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

describe('applyTaskAction — flag (simple action)', () => {
  it('sets dispatch_status=failed and status=blocked', async () => {
    const { sb, updates } = makeSb({ task: { key: 't1', dispatch_count: 2 } });
    expect(await applyTaskAction(sb, { key: 't1', action: 'flag' })).toEqual({
      status: 200,
      body: { ok: true, dispatch_status: 'failed', status: 'blocked' },
    });
    expect(updates[0]).toEqual({ dispatch_status: 'failed', status: 'blocked' });
  });
});

describe('applyTaskAction — redispatch (injected GitHub port, ops#139)', () => {
  const task = {
    key: 't1',
    title: 'Do it',
    dispatch_count: 1,
    dispatch_url: 'https://github.com/hirobius/ops/issues/9',
  };

  it('404s when the task is missing', async () => {
    const { sb } = makeSb({ task: null });
    expect(
      await applyTaskAction(sb, { key: 'nope', action: 'redispatch' }, { github: null }),
    ).toMatchObject({ status: 404 });
  });

  it('bumps dispatch_count, restamps last_dispatched_at, and re-asserts dispatch_status without a comment by default', async () => {
    const { sb, updates } = makeSb({ task });
    const github = {
      commentOnIssue: async () => {
        throw new Error('should not be called — comment not requested');
      },
    };
    const result = await applyTaskAction(sb, { key: 't1', action: 'redispatch' }, { github });
    expect(result).toEqual({
      status: 200,
      body: expect.objectContaining({
        ok: true,
        dispatch_count: 2,
        dispatch_status: 'dispatched',
      }),
    });
    expect(updates.at(-1)).toMatchObject({ dispatch_count: 2, dispatch_status: 'dispatched' });
  });

  it('leaves a re-ping comment on the existing issue when comment=true', async () => {
    const { sb } = makeSb({ task });
    const comments: Array<{ issueUrl: string; body: string }> = [];
    const github = {
      commentOnIssue: async (i: { issueUrl: string; body: string }) => {
        comments.push(i);
        return {};
      },
    };
    const result = await applyTaskAction(
      sb,
      { key: 't1', action: 'redispatch', comment: true, maxRetries: 2 },
      { github },
    );
    expect(comments[0].issueUrl).toBe('https://github.com/hirobius/ops/issues/9');
    expect(comments[0].body).toContain('retry 2/2');
    expect((result.body as { commentError?: string }).commentError).toBeUndefined();
  });

  it('reports commentError but still re-dispatches when comment=true and no GitHub port is configured', async () => {
    const { sb, updates } = makeSb({ task });
    const result = await applyTaskAction(
      sb,
      { key: 't1', action: 'redispatch', comment: true, maxRetries: 2 },
      { github: null },
    );
    expect(result.status).toBe(200);
    expect((result.body as { commentError?: string }).commentError).toMatch(
      /GITHUB_TOKEN not set/,
    );
    expect(updates.at(-1)).toMatchObject({ dispatch_status: 'dispatched' });
  });

  it('reports commentError when the task has no dispatch_url on record', async () => {
    const { sb } = makeSb({ task: { ...task, dispatch_url: null } });
    const github = { commentOnIssue: async () => ({}) };
    const result = await applyTaskAction(
      sb,
      { key: 't1', action: 'redispatch', comment: true, maxRetries: 2 },
      { github },
    );
    expect((result.body as { commentError?: string }).commentError).toMatch(/no dispatch_url/);
  });

  it('reports commentError when the port throws, but the field restamp still lands', async () => {
    const { sb, updates } = makeSb({ task });
    const github = {
      commentOnIssue: async () => {
        throw new Error('HTTP 422');
      },
    };
    const result = await applyTaskAction(
      sb,
      { key: 't1', action: 'redispatch', comment: true, maxRetries: 2 },
      { github },
    );
    expect(result.status).toBe(200);
    expect((result.body as { commentError?: string }).commentError).toContain('422');
    expect(updates.at(-1)).toMatchObject({ dispatch_status: 'dispatched' });
  });

  it('500s when the field restamp errors', async () => {
    const { sb } = makeSb({ task, updateError: { message: 'write failed' } });
    expect(
      await applyTaskAction(sb, { key: 't1', action: 'redispatch' }, { github: null }),
    ).toMatchObject({ status: 500 });
  });

  it('treats a missing dispatch_count as 0 before bumping', async () => {
    const { sb, updates } = makeSb({ task: { ...task, dispatch_count: undefined } });
    await applyTaskAction(sb, { key: 't1', action: 'redispatch' }, { github: null });
    expect(updates.at(-1)).toMatchObject({ dispatch_count: 1 });
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

describe('applyTaskAction — ralph_approve (injected GitHub port, ops#137)', () => {
  const task = { key: 'github:hirobius/ops#137', title: 'Approve merge action' };

  it('503s when no port is configured (no GITHUB_TOKEN)', async () => {
    const { sb } = makeSb({ task });
    expect(
      await applyTaskAction(
        sb,
        { key: 'github:hirobius/ops#137', action: 'ralph_approve' },
        { github: null },
      ),
    ).toMatchObject({ status: 503, body: { code: 'ENV_MISSING_GITHUB_TOKEN' } });
  });

  it('404s when the task is missing', async () => {
    const { sb } = makeSb({ task: null });
    const github = { findRalphPr: async () => null, addLabel: async () => ({}) };
    expect(
      await applyTaskAction(sb, { key: 'nope', action: 'ralph_approve' }, { github }),
    ).toMatchObject({ status: 404 });
  });

  it('400s when the task is not a github-tracked issue', async () => {
    const { sb } = makeSb({ task: { key: 't1', title: 'Do it' } });
    const github = { findRalphPr: async () => null, addLabel: async () => ({}) };
    expect(
      await applyTaskAction(sb, { key: 't1', action: 'ralph_approve' }, { github }),
    ).toMatchObject({ status: 400 });
  });

  it('404s naming the expected branch prefix when no PR is found', async () => {
    const { sb } = makeSb({ task });
    const github = { findRalphPr: async () => null, addLabel: async () => ({}) };
    const result = await applyTaskAction(
      sb,
      { key: 'github:hirobius/ops#137', action: 'ralph_approve' },
      { github },
    );
    expect(result.status).toBe(404);
    expect((result.body as { error: string }).error).toContain('ralph/issue-137-');
  });

  it('labels the open PR ralph-approved via the port', async () => {
    const { sb } = makeSb({ task });
    const calls: Array<{ issueUrl: string; label: string }> = [];
    const github = {
      findRalphPr: async (i: { owner: string; repo: string; issueNumber: string }) => {
        expect(i).toEqual({ owner: 'hirobius', repo: 'ops', issueNumber: '137' });
        return {
          number: 9,
          url: 'https://github.com/hirobius/ops/pull/9',
          state: 'open',
          merged: false,
        };
      },
      addLabel: async (i: { issueUrl: string; label: string }) => {
        calls.push(i);
        return {};
      },
    };
    const result = await applyTaskAction(
      sb,
      { key: 'github:hirobius/ops#137', action: 'ralph_approve' },
      { github },
    );
    expect(calls[0]).toEqual({
      issueUrl: 'https://github.com/hirobius/ops/pull/9',
      label: 'ralph-approved',
    });
    expect(result).toEqual({
      status: 200,
      body: { ok: true, prUrl: 'https://github.com/hirobius/ops/pull/9' },
    });
  });

  it('gracefully no-ops when the PR is already merged', async () => {
    const { sb } = makeSb({ task });
    const github = {
      findRalphPr: async () => ({
        number: 9,
        url: 'https://github.com/hirobius/ops/pull/9',
        state: 'closed',
        merged: true,
      }),
      addLabel: async () => {
        throw new Error('should not be called');
      },
    };
    const result = await applyTaskAction(
      sb,
      { key: 'github:hirobius/ops#137', action: 'ralph_approve' },
      { github },
    );
    expect(result).toEqual({
      status: 200,
      body: { ok: true, note: 'already merged', prUrl: 'https://github.com/hirobius/ops/pull/9' },
    });
  });

  it('gracefully no-ops when the PR is closed without merging', async () => {
    const { sb } = makeSb({ task });
    const github = {
      findRalphPr: async () => ({
        number: 9,
        url: 'https://github.com/hirobius/ops/pull/9',
        state: 'closed',
        merged: false,
      }),
      addLabel: async () => {
        throw new Error('should not be called');
      },
    };
    const result = await applyTaskAction(
      sb,
      { key: 'github:hirobius/ops#137', action: 'ralph_approve' },
      { github },
    );
    expect(result).toEqual({
      status: 200,
      body: { ok: true, note: 'closed', prUrl: 'https://github.com/hirobius/ops/pull/9' },
    });
  });

  it('502s with a token-rejected hint when the port throws 401/403', async () => {
    const { sb } = makeSb({ task });
    const github = {
      findRalphPr: async () => {
        throw new Error('HTTP 401');
      },
      addLabel: async () => ({}),
    };
    const result = await applyTaskAction(
      sb,
      { key: 'github:hirobius/ops#137', action: 'ralph_approve' },
      { github },
    );
    expect(result.status).toBe(502);
    expect((result.body as { code: string }).code).toBe('GITHUB_TOKEN_REJECTED');
  });
});
