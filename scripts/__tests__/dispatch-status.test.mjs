/**
 * lib/tasks/dispatch-status.mjs — live dispatch-status poller (ops#107).
 *
 * Pure functions only: no network, no live Supabase/GitHub. `resolveLiveDispatchStatuses`
 * is exercised against a hand-rolled stub GitHub port + a recording `writePatch`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  deriveDispatchPatch,
  pickLatestLinkedPr,
  resolveLiveDispatchStatuses,
  resetDispatchStatusCache,
} from '../../lib/tasks/dispatch-status.mjs';

// The live PR lookup is TTL-cached at module scope (mirrors
// lib/projects/index.mjs::attachRepoStatuses) — reset it between tests so
// one test's cached lookup can't leak into the next.
beforeEach(() => {
  resetDispatchStatusCache();
});

const NOW = new Date('2026-07-12T12:00:00.000Z').getTime();

function task(overrides = {}) {
  return {
    key: 'github:hirobius/ops#42',
    status: 'open',
    dispatch_status: 'dispatched',
    completed_at: null,
    pr_url: null,
    ...overrides,
  };
}

function pr(overrides = {}) {
  return {
    number: 9,
    url: 'https://github.com/hirobius/ops/pull/9',
    state: 'open',
    merged: false,
    created_at: '2026-07-12T00:00:00.000Z',
    ...overrides,
  };
}

describe('pickLatestLinkedPr', () => {
  it('returns null for an empty or non-array input', () => {
    expect(pickLatestLinkedPr([])).toBeNull();
    expect(pickLatestLinkedPr(undefined)).toBeNull();
    expect(pickLatestLinkedPr(null)).toBeNull();
  });

  it('returns the only PR when there is exactly one', () => {
    const p = pr();
    expect(pickLatestLinkedPr([p])).toEqual(p);
  });

  it('resolves multiple candidates to the newest by created_at', () => {
    const older = pr({ number: 5, created_at: '2026-06-01T00:00:00.000Z' });
    const newer = pr({ number: 9, created_at: '2026-07-01T00:00:00.000Z' });
    expect(pickLatestLinkedPr([older, newer])).toEqual(newer);
    expect(pickLatestLinkedPr([newer, older])).toEqual(newer);
  });
});

describe('deriveDispatchPatch', () => {
  it('requires a numeric `now`', () => {
    expect(() => deriveDispatchPatch(task(), pr(), {})).toThrow(/requires a numeric `now`/);
  });

  it('returns null when there is no linked PR yet (stays dispatched)', () => {
    expect(deriveDispatchPatch(task(), null, { now: NOW })).toBeNull();
  });

  it('an open PR moves dispatched → running and stamps pr_url', () => {
    const p = pr({ state: 'open', merged: false });
    expect(deriveDispatchPatch(task(), p, { now: NOW })).toEqual({
      dispatch_status: 'running',
      pr_url: p.url,
    });
  });

  it('a merged PR moves → done, flips task status, and stamps completed_at', () => {
    const p = pr({ state: 'closed', merged: true });
    expect(deriveDispatchPatch(task({ dispatch_status: 'running' }), p, { now: NOW })).toEqual({
      dispatch_status: 'done',
      status: 'done',
      completed_at: new Date(NOW).toISOString(),
      pr_url: p.url,
    });
  });

  it('a merged PR preserves an existing completed_at rather than overwriting it', () => {
    const p = pr({ state: 'closed', merged: true });
    const existing = '2026-07-10T00:00:00.000Z';
    const patch = deriveDispatchPatch(task({ completed_at: existing }), p, { now: NOW });
    expect(patch.completed_at).toBe(existing);
  });

  it('a closed, unmerged PR moves → failed without touching task status', () => {
    const p = pr({ state: 'closed', merged: false });
    expect(deriveDispatchPatch(task({ dispatch_status: 'running' }), p, { now: NOW })).toEqual({
      dispatch_status: 'failed',
      pr_url: p.url,
    });
  });

  it('is idempotent: returns null once the task already reflects the open-PR state', () => {
    const p = pr({ state: 'open' });
    const t = task({ dispatch_status: 'running', pr_url: p.url });
    expect(deriveDispatchPatch(t, p, { now: NOW })).toBeNull();
  });

  it('is idempotent: returns null once the task already reflects the merged state', () => {
    const p = pr({ state: 'closed', merged: true });
    const t = task({ dispatch_status: 'done', status: 'done', pr_url: p.url, completed_at: '2026-07-11T00:00:00.000Z' });
    expect(deriveDispatchPatch(t, p, { now: NOW })).toBeNull();
  });

  it('is idempotent: returns null once the task already reflects the failed state', () => {
    const p = pr({ state: 'closed', merged: false });
    const t = task({ dispatch_status: 'failed', pr_url: p.url });
    expect(deriveDispatchPatch(t, p, { now: NOW })).toBeNull();
  });

  it('re-derives when the linked PR changes (new pr_url even with the same dispatch_status)', () => {
    const p = pr({ state: 'open', url: 'https://github.com/hirobius/ops/pull/10' });
    const t = task({ dispatch_status: 'running', pr_url: 'https://github.com/hirobius/ops/pull/9' });
    expect(deriveDispatchPatch(t, p, { now: NOW })).toEqual({
      dispatch_status: 'running',
      pr_url: p.url,
    });
  });
});

function stubGithub(prsByIssue) {
  return {
    getLinkedPullRequest: vi.fn(async ({ owner, repo, issueNumber }) => {
      const key = `${owner}/${repo}#${issueNumber}`;
      if (prsByIssue[key] instanceof Error) throw prsByIssue[key];
      return prsByIssue[key] ?? [];
    }),
  };
}

describe('resolveLiveDispatchStatuses', () => {
  it('returns the input tasks unchanged when no GitHub port is available', async () => {
    const tasks = [task()];
    const out = await resolveLiveDispatchStatuses(tasks, { github: null, now: NOW });
    expect(out).toEqual(tasks);
  });

  it('requires a numeric `now`', async () => {
    await expect(
      resolveLiveDispatchStatuses([task()], { github: stubGithub({}) }),
    ).rejects.toThrow(/requires a numeric `now`/);
  });

  it('skips tasks that are not github:*-keyed', async () => {
    const t = task({ key: 'tracker:some-task' });
    const github = stubGithub({});
    const out = await resolveLiveDispatchStatuses([t], { github, now: NOW });
    expect(out).toEqual([t]);
    expect(github.getLinkedPullRequest).not.toHaveBeenCalled();
  });

  it('skips tasks that are not currently dispatched/running (e.g. queued, done)', async () => {
    const queued = task({ dispatch_status: 'queued' });
    const done = task({ key: 'github:hirobius/ops#43', dispatch_status: 'done', status: 'done' });
    const github = stubGithub({});
    const out = await resolveLiveDispatchStatuses([queued, done], { github, now: NOW });
    expect(out).toEqual([queued, done]);
    expect(github.getLinkedPullRequest).not.toHaveBeenCalled();
  });

  it('moves a dispatched task with an open linked PR to running and writes the patch', async () => {
    const p = pr({ state: 'open' });
    const t = task();
    const github = stubGithub({ 'hirobius/ops#42': [p] });
    const writePatch = vi.fn(async () => {});
    const out = await resolveLiveDispatchStatuses([t], { github, now: NOW, writePatch });

    expect(out).toEqual([{ ...t, dispatch_status: 'running', pr_url: p.url }]);
    expect(writePatch).toHaveBeenCalledWith('github:hirobius/ops#42', {
      dispatch_status: 'running',
      pr_url: p.url,
    });
  });

  it('moves a running task to done + flips status when the linked PR merges', async () => {
    const p = pr({ state: 'closed', merged: true });
    const t = task({ dispatch_status: 'running', pr_url: p.url.replace('9', '3') });
    const github = stubGithub({ 'hirobius/ops#42': [p] });
    const writePatch = vi.fn(async () => {});
    const out = await resolveLiveDispatchStatuses([t], { github, now: NOW, writePatch });

    expect(out[0]).toMatchObject({ dispatch_status: 'done', status: 'done', pr_url: p.url });
    expect(out[0].completed_at).toBe(new Date(NOW).toISOString());
    expect(writePatch).toHaveBeenCalledTimes(1);
  });

  it('re-checks an already-running task and moves it to failed when the PR closes unmerged', async () => {
    const p = pr({ state: 'closed', merged: false });
    const t = task({ dispatch_status: 'running', pr_url: 'https://github.com/hirobius/ops/pull/3' });
    const github = stubGithub({ 'hirobius/ops#42': [p] });
    const writePatch = vi.fn(async () => {});
    const out = await resolveLiveDispatchStatuses([t], { github, now: NOW, writePatch });

    expect(out[0]).toMatchObject({ dispatch_status: 'failed', pr_url: p.url });
    expect(writePatch).toHaveBeenCalledWith('github:hirobius/ops#42', {
      dispatch_status: 'failed',
      pr_url: p.url,
    });
  });

  it('is fail-soft: a GitHub lookup error leaves the task unchanged, no throw', async () => {
    const t = task();
    const github = stubGithub({ 'hirobius/ops#42': new Error('GitHub 500') });
    const out = await resolveLiveDispatchStatuses([t], { github, now: NOW });
    expect(out).toEqual([t]);
  });

  it('is fail-soft: a writePatch error still reflects the live state in the response', async () => {
    const p = pr({ state: 'open' });
    const t = task();
    const github = stubGithub({ 'hirobius/ops#42': [p] });
    const writePatch = vi.fn(async () => {
      throw new Error('Supabase write failed');
    });
    const out = await resolveLiveDispatchStatuses([t], { github, now: NOW, writePatch });
    expect(out[0]).toMatchObject({ dispatch_status: 'running', pr_url: p.url });
  });

  it('TTL-caches the GitHub lookup — a second call within the window does not re-fetch', async () => {
    const p = pr({ state: 'open' });
    const t1 = task();
    const t2 = task({ key: 'github:hirobius/ops#42' }); // same underlying issue
    const github = stubGithub({ 'hirobius/ops#42': [p] });
    await resolveLiveDispatchStatuses([t1], { github, now: NOW });
    await resolveLiveDispatchStatuses([t2], { github, now: NOW + 1_000 });
    expect(github.getLinkedPullRequest).toHaveBeenCalledTimes(1);
  });

  it('leaves other tasks in the list untouched', async () => {
    const other = task({ key: 'github:hirobius/ops#99', dispatch_status: 'blocked', status: 'blocked' });
    const github = stubGithub({ 'hirobius/ops#42': [] });
    const out = await resolveLiveDispatchStatuses([task(), other], { github, now: NOW });
    expect(out[1]).toEqual(other);
  });
});
