// @vitest-environment node
/**
 * api/tasks.ts's importIssuesHandler — fetch → upsert → page → reconcile →
 * retire, exercised end-to-end with a STUB GitHub port and a stub Supabase
 * client (no env, no fetch, no DB — same injection pattern as
 * tests/api/task-actions.test.ts). `notifyEvent` is mocked so the
 * needs-adrian pager (ops#51) is asserted on without touching the real
 * events log or network.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/ops/notify.mjs', () => ({ notifyEvent: vi.fn() }));

import { importIssuesHandler } from '../../api/tasks';
import { notifyEvent } from '../../lib/ops/notify.mjs';

const notifyEventMock = vi.mocked(notifyEvent);

function makeSb(
  opts: {
    existingKeys?: string[];
    existingTags?: Array<{ key: string; tags: string[] }>;
    upsertError?: { message: string } | null;
    listError?: { message: string } | null;
    tagsListError?: { message: string } | null;
    retireError?: { message: string } | null;
  } = {},
) {
  const {
    existingKeys = [],
    existingTags = [],
    upsertError = null,
    listError = null,
    tagsListError = null,
    retireError = null,
  } = opts;
  const calls: { upserted?: unknown[]; retired?: string[] } = {};
  const sb = {
    from() {
      return {
        upsert(rows: unknown[]) {
          calls.upserted = rows;
          return Promise.resolve({ data: rows, error: upsertError });
        },
        select(cols: string) {
          const isTagsQuery = cols.includes('tags');
          return {
            like() {
              return {
                is() {
                  return {
                    neq: async () =>
                      isTagsQuery
                        ? { data: existingTags, error: tagsListError }
                        : { data: existingKeys.map((key) => ({ key })), error: listError },
                  };
                },
              };
            },
          };
        },
        update() {
          return {
            in: async (_col: string, keys: string[]) => {
              calls.retired = keys;
              return { data: keys, error: retireError };
            },
          };
        },
      };
    },
  };
  return { sb: sb as never, calls };
}

const issue = (repo: string, number: number, title = 'A task', labels: string[] = []) => ({
  repo,
  number,
  title,
  url: `https://github.com/${repo}/issues/${number}`,
  labels,
});

describe('importIssuesHandler', () => {
  beforeEach(() => {
    notifyEventMock.mockClear();
  });

  it('503s when no GitHub port is configured (no GITHUB_TOKEN)', async () => {
    const { sb } = makeSb();
    const result = await importIssuesHandler(sb, {} as never, { github: null as never });
    expect(result).toMatchObject({ status: 503, body: { code: 'ENV_MISSING_GITHUB_TOKEN' } });
  });

  it('502s when the GitHub fetch throws', async () => {
    const { sb } = makeSb();
    const github = {
      listOpenIssues: async () => {
        throw new Error('HTTP 502 — bad gateway');
      },
    };
    const result = await importIssuesHandler(sb, {} as never, { github: github as never });
    expect(result).toMatchObject({ status: 502, body: { code: 'GITHUB_LIST_FAILED' } });
  });

  it('upserts live issues, then retires stored github:* keys absent from the live set', async () => {
    const { sb, calls } = makeSb({
      existingKeys: [
        'github:hirobius/hds#1',
        'github:hirobius/hirobius-design-system#1', // renamed-repo stray — should retire
        'github:hirobius/hds#2', // closed — should retire
      ],
    });
    const github = {
      listOpenIssues: async () => ({
        issues: [issue('hirobius/hds', 1)],
        truncated: false,
        fetched: 1,
      }),
    };
    const result = await importIssuesHandler(sb, {} as never, { github: github as never });
    expect(result).toEqual({
      status: 200,
      body: { imported: 1, retired: 2, paged: 0, reconcile: 'ok' },
    });
    expect(calls.upserted).toHaveLength(1);
    expect(calls.retired).toEqual(
      expect.arrayContaining(['github:hirobius/hirobius-design-system#1', 'github:hirobius/hds#2']),
    );
  });

  it('skips the reconcile — never retires — when the live set is empty but keys are stored', async () => {
    const { sb, calls } = makeSb({ existingKeys: ['github:hirobius/ops#1'] });
    const github = { listOpenIssues: async () => ({ issues: [], truncated: false, fetched: 0 }) };
    const result = await importIssuesHandler(sb, {} as never, { github: github as never });
    expect(result).toEqual({
      status: 200,
      body: { imported: 0, retired: 0, paged: 0, reconcile: 'skipped:empty-live-set' },
    });
    expect(calls.retired).toBeUndefined();
  });

  it('skips the reconcile when the retire batch would be a mass-retire', async () => {
    const existingKeys = Array.from({ length: 8 }, (_, i) => `github:hirobius/ops#${i}`);
    const { sb, calls } = makeSb({ existingKeys });
    const github = {
      // Only 2 of the 8 stored issues are still live — a 6-of-8 retire, over the guard's threshold.
      listOpenIssues: async () => ({
        issues: [issue('hirobius/ops', 0), issue('hirobius/ops', 1)],
        truncated: false,
        fetched: 2,
      }),
    };
    const result = await importIssuesHandler(sb, {} as never, { github: github as never });
    expect(result).toEqual({
      status: 200,
      body: { imported: 2, retired: 0, paged: 0, reconcile: 'skipped:mass-retire' },
    });
    expect(calls.retired).toBeUndefined();
  });

  it('leaves non-github task sources untouched — listGithubTaskKeys scopes the diff', async () => {
    const { sb, calls } = makeSb({ existingKeys: ['github:hirobius/ops#1'] });
    const github = {
      listOpenIssues: async () => ({
        issues: [issue('hirobius/ops', 1)],
        truncated: false,
        fetched: 1,
      }),
    };
    const result = await importIssuesHandler(sb, {} as never, { github: github as never });
    expect(result).toEqual({
      status: 200,
      body: { imported: 1, retired: 0, paged: 0, reconcile: 'ok' },
    });
    expect(calls.retired).toBeUndefined();
  });

  it('pages a task whose issue is newly labeled needs-adrian (ops#51)', async () => {
    const { sb } = makeSb({ existingTags: [{ key: 'github:hirobius/ops#1', tags: [] }] });
    const github = {
      listOpenIssues: async () => [issue('hirobius/ops', 1, 'Pick a design', ['needs-adrian'])],
    };
    const result = await importIssuesHandler(sb, {} as never, { github: github as never });
    expect(result).toMatchObject({ status: 200, body: { paged: 1 } });
    expect(notifyEventMock).toHaveBeenCalledTimes(1);
    expect(notifyEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'approval_waiting',
        title: 'Pick a design — needs you',
        url: 'https://github.com/hirobius/ops/issues/1',
        task: 'github:hirobius/ops#1',
      }),
      expect.objectContaining({ path: '/tmp/ops-events.jsonl' }),
    );
  });

  it('does not re-page a task that already carried needs-adrian on the last import', async () => {
    const { sb } = makeSb({
      existingTags: [{ key: 'github:hirobius/ops#1', tags: ['needs-adrian'] }],
    });
    const github = {
      listOpenIssues: async () => [issue('hirobius/ops', 1, 'Pick a design', ['needs-adrian'])],
    };
    const result = await importIssuesHandler(sb, {} as never, { github: github as never });
    expect(result).toMatchObject({ status: 200, body: { paged: 0 } });
    expect(notifyEventMock).not.toHaveBeenCalled();
  });

  it('a notify failure never fails the import (fail-soft)', async () => {
    const { sb } = makeSb({ existingTags: [{ key: 'github:hirobius/ops#1', tags: [] }] });
    notifyEventMock.mockRejectedValueOnce(new Error('EROFS: read-only file system'));
    const github = {
      listOpenIssues: async () => [issue('hirobius/ops', 1, 'Pick a design', ['needs-adrian'])],
    };
    const result = await importIssuesHandler(sb, {} as never, { github: github as never });
    expect(result).toMatchObject({ status: 200, body: { imported: 1, paged: 1 } });
  });

  it('500s when the pre-upsert tags read fails', async () => {
    const { sb } = makeSb({ tagsListError: { message: 'db down' } });
    const github = { listOpenIssues: async () => [issue('hirobius/ops', 1)] };
    const result = await importIssuesHandler(sb, {} as never, { github: github as never });
    expect(result).toEqual({ status: 500, body: { error: 'db down' } });
  });
});
