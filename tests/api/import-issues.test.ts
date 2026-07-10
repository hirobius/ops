// @vitest-environment node
/**
 * lib/tasks/import-issues.mjs — the pure GitHub-issue → task-row mapper.
 * No network, no DB: exercised directly against the array shape
 * GitHubIssuePort#listOpenIssues (lib/github/issues.mjs) returns.
 */
import { describe, it, expect } from 'vitest';
import { mapIssuesToTasks } from '../../lib/tasks/import-issues.mjs';

describe('mapIssuesToTasks', () => {
  it('maps one issue to the exact expected task row', () => {
    const issues = [
      {
        repo: 'hirobius/ops',
        number: 42,
        title: 'Task importer foundation',
        url: 'https://github.com/hirobius/ops/issues/42',
        state: 'open',
        labels: [],
        updated_at: '2026-07-01T00:00:00Z',
      },
    ];

    expect(mapIssuesToTasks(issues)).toEqual([
      {
        key: 'github:hirobius/ops#42',
        source: 'github:hirobius/ops',
        native_key: '42',
        title: 'Task importer foundation',
        status: 'open',
        lane: 'ops',
        group: 'Internal',
        dispatch_url: 'https://github.com/hirobius/ops/issues/42',
        tags: [],
      },
    ]);
  });

  it('carries GitHub labels through as tags (ralph-ready, triage, …)', () => {
    const issues = [
      {
        repo: 'hirobius/ops',
        number: 88,
        title: 'one-tap ralph-ready',
        url: 'https://github.com/hirobius/ops/issues/88',
        labels: ['ralph-ready', 'triage'],
      },
    ];
    expect(mapIssuesToTasks(issues)[0]).toMatchObject({ tags: ['ralph-ready', 'triage'] });
  });

  it('defaults tags to [] when the issue carries no labels field', () => {
    const issues = [{ repo: 'hirobius/ops', number: 1, title: 'A', url: 'https://gh/1' }];
    expect(mapIssuesToTasks(issues)[0]).toMatchObject({ tags: [] });
  });

  it('maps multiple issues across different repos independently', () => {
    const issues = [
      { repo: 'hirobius/ops', number: 1, title: 'A', url: 'https://gh/1' },
      { repo: 'hirobius/hirobius-design-system', number: 7, title: 'B', url: 'https://gh/7' },
    ];
    const rows = mapIssuesToTasks(issues);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ key: 'github:hirobius/ops#1', lane: 'ops' });
    expect(rows[1]).toMatchObject({
      key: 'github:hirobius/hirobius-design-system#7',
      lane: 'hirobius-design-system',
    });
  });

  it('returns [] for an empty or non-array input', () => {
    expect(mapIssuesToTasks([])).toEqual([]);
    expect(mapIssuesToTasks(undefined)).toEqual([]);
  });
});
