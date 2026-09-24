import { describe, expect, it } from 'vitest';
import { buildFleetStatus } from '../../lib/tasks/fleet-status.mjs';

// ops#405 follow-up: the PR search is scoped by OWNER (`user:hirobius`), so
// open PRs in non-fleet hirobius repos (job-hunt, lilac, …) inflated the
// "All repos" chip after the issue sweep itself was fleet-scoped.
function stubPort(prs: Array<{ repo: string; number: number }>) {
  return {
    listOpenIssues: async () => ({
      issues: [
        {
          repo: 'hirobius/ops',
          number: 1,
          title: 't',
          url: 'u',
          state: 'open',
          labels: [],
          updated_at: '2026-09-24T00:00:00Z',
          created_at: '2026-09-24T00:00:00Z',
          comments: 0,
          assignee: null,
          hasDod: true,
          excerpt: '',
          decision: null,
        },
      ],
      truncated: false,
      fetched: 1,
      kept: 1,
    }),
    searchOpenPrs: async () =>
      prs.map((p) => ({
        ...p,
        url: 'u',
        title: 't',
        draft: false,
        updatedAt: '2026-09-24T00:00:00Z',
        labels: [],
      })),
    listRalphRuns: async () => [],
  };
}

describe('buildFleetStatus — open PRs', () => {
  it('keeps only PRs from fleet repos', async () => {
    const gh = stubPort([
      { repo: 'hirobius/ops', number: 10 },
      { repo: 'hirobius/job-hunt', number: 84 },
      { repo: 'hirobius/Ralph', number: 30 },
    ]);
    const res = await buildFleetStatus(gh as never, { sb: null, env: {} });
    expect(res.status).toBe(200);
    const repos = (res.body as { prs: Array<{ repo: string }> }).prs.map((p) => p.repo);
    expect(repos).toEqual(['hirobius/ops', 'hirobius/Ralph']);
  });
});
