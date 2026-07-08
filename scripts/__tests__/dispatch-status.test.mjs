/**
 * lib/tasks/dispatch-status.mjs — live dispatch-status feed (issue #50).
 *
 * deriveDispatchPatch is pure (no network, no Date-inside — `now` is
 * caller-supplied). resolveLiveDispatchStatuses is exercised with a STUB
 * GitHub port, same pattern as tests/api/task-actions.test.ts's dispatch tests.
 */

import { describe, it, expect } from 'vitest';
import { deriveDispatchPatch, resolveLiveDispatchStatuses } from '../../lib/tasks/dispatch-status.mjs';
import { pickLatestLinkedPr } from '../../lib/github/issues.mjs';

describe('deriveDispatchPatch', () => {
  it('returns null when no PR is linked yet (still just dispatched)', () => {
    expect(deriveDispatchPatch(null)).toBeNull();
  });

  it('merged PR → done, and flips the task status to done too', () => {
    const patch = deriveDispatchPatch(
      { url: 'https://gh/pr/1', number: 1, state: 'closed', merged: true, draft: false },
      '2026-07-08T00:00:00.000Z',
    );
    expect(patch).toEqual({
      dispatch_status: 'done',
      status: 'done',
      pr_url: 'https://gh/pr/1',
      completed_at: '2026-07-08T00:00:00.000Z',
    });
  });

  it('closed-unmerged PR → failed', () => {
    const patch = deriveDispatchPatch({
      url: 'https://gh/pr/2',
      number: 2,
      state: 'closed',
      merged: false,
      draft: false,
    });
    expect(patch).toEqual({ dispatch_status: 'failed', pr_url: 'https://gh/pr/2' });
  });

  it('open PR → running', () => {
    const patch = deriveDispatchPatch({
      url: 'https://gh/pr/3',
      number: 3,
      state: 'open',
      merged: false,
      draft: true,
    });
    expect(patch).toEqual({ dispatch_status: 'running', pr_url: 'https://gh/pr/3' });
  });
});

describe('pickLatestLinkedPr', () => {
  it('null when the timeline has no cross-referenced PR', () => {
    expect(pickLatestLinkedPr([{ event: 'commented' }])).toBeNull();
  });

  it('ignores cross-references to plain issues (no pull_request key)', () => {
    expect(pickLatestLinkedPr([{ event: 'cross-referenced', source: { issue: { number: 5 } } }])).toBeNull();
  });

  it('picks the most recent linked PR, mapping merged/draft/state', () => {
    const events = [
      {
        event: 'cross-referenced',
        source: {
          issue: {
            html_url: 'https://gh/pr/1',
            number: 1,
            state: 'closed',
            draft: false,
            pull_request: { merged_at: null },
          },
        },
      },
      {
        event: 'cross-referenced',
        source: {
          issue: {
            html_url: 'https://gh/pr/2',
            number: 2,
            state: 'open',
            draft: true,
            pull_request: { merged_at: '2026-07-08T00:00:00Z' },
          },
        },
      },
    ];
    expect(pickLatestLinkedPr(events)).toEqual({
      url: 'https://gh/pr/2',
      number: 2,
      state: 'open',
      merged: true,
      draft: true,
    });
  });
});

describe('resolveLiveDispatchStatuses', () => {
  function stubGithub(linkedPr) {
    const calls = [];
    return {
      calls,
      port: {
        async getLinkedPullRequest({ issueUrl }) {
          calls.push(issueUrl);
          return linkedPr;
        },
      },
    };
  }

  it('no-ops without a GitHub port', async () => {
    const tasks = [{ key: 't1', dispatch_url: 'https://gh/issues/1', dispatch_status: 'dispatched', status: 'open' }];
    await resolveLiveDispatchStatuses(tasks, { github: null });
    expect(tasks[0].dispatch_status).toBe('dispatched');
  });

  it('skips tasks with no dispatch_url or a terminal dispatch_status', async () => {
    const { port, calls } = stubGithub({ url: 'x', number: 1, state: 'open', merged: false, draft: false });
    const tasks = [
      { key: 'no-url', dispatch_url: null, dispatch_status: 'dispatched', status: 'open' },
      { key: 'already-done', dispatch_url: 'https://gh/issues/2', dispatch_status: 'done', status: 'done' },
      { key: 'already-failed', dispatch_url: 'https://gh/issues/3', dispatch_status: 'failed', status: 'blocked' },
    ];
    await resolveLiveDispatchStatuses(tasks, { github: port });
    expect(calls).toHaveLength(0);
  });

  it('still checks a dispatch_url row with a null dispatch_status (pre-migration-0008 dispatches)', async () => {
    const { port, calls } = stubGithub({
      url: 'https://gh/pr/4',
      number: 4,
      state: 'open',
      merged: false,
      draft: false,
    });
    const tasks = [{ key: 't-legacy', dispatch_url: 'https://gh/issues/4', dispatch_status: null, status: 'open' }];
    await resolveLiveDispatchStatuses(tasks, { github: port });
    expect(calls).toEqual(['https://gh/issues/4']);
    expect(tasks[0].dispatch_status).toBe('running');
  });

  it('patches a dispatched task in place when its PR is merged, and best-effort persists', async () => {
    const { port } = stubGithub({
      url: 'https://gh/pr/9',
      number: 9,
      state: 'closed',
      merged: true,
      draft: false,
    });
    const tasks = [
      { key: 't1', dispatch_url: 'https://gh/issues/9', dispatch_status: 'dispatched', status: 'open' },
    ];
    const updates = [];
    const updateTask = async (_sb, key, patch) => {
      updates.push({ key, patch });
      return { error: null };
    };
    await resolveLiveDispatchStatuses(tasks, { github: port, updateTask, sb: {} });
    expect(tasks[0]).toMatchObject({ dispatch_status: 'done', status: 'done', pr_url: 'https://gh/pr/9' });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ key: 't1', patch: { dispatch_status: 'done', status: 'done' } });
  });

  it('fails soft when the GitHub port throws — leaves the task untouched', async () => {
    const port = {
      async getLinkedPullRequest() {
        throw new Error('HTTP 502');
      },
    };
    const tasks = [
      { key: 't1', dispatch_url: 'https://gh/issues/1', dispatch_status: 'dispatched', status: 'open' },
    ];
    await resolveLiveDispatchStatuses(tasks, { github: port });
    expect(tasks[0].dispatch_status).toBe('dispatched');
  });
});
