// @vitest-environment node
/**
 * lib/github/issues.mjs — makeGitHubPort().listOpenIssues pagination (ops#143).
 *
 * The `GET /issues` feed caps at 100 items/page; without following
 * `Link: rel="next"` the least-recently-updated repos' issues fall off the
 * page whenever another repo has a burst of activity. These tests stub
 * global fetch directly (no GITHUB_TOKEN in the real env) to exercise the
 * production adapter itself, not a hand-rolled stub port.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeGitHubPort } from '../../lib/github/issues.mjs';

function rawIssue(n, repo = 'hirobius/ops') {
  return {
    number: n,
    title: `issue ${n}`,
    html_url: `https://github.com/${repo}/issues/${n}`,
    state: 'open',
    labels: [],
    updated_at: '2026-07-01T00:00:00Z',
    repository_url: `https://api.github.com/repos/${repo}`,
  };
}

function pageResponse(issues, linkHeader = null) {
  return {
    ok: true,
    status: 200,
    headers: { get: (h) => (h.toLowerCase() === 'link' ? linkHeader : null) },
    json: async () => issues,
  };
}

describe('makeGitHubPort().listOpenIssues — pagination', () => {
  const originalToken = process.env.GITHUB_TOKEN;

  beforeEach(() => {
    process.env.GITHUB_TOKEN = 'test-token';
  });

  afterEach(() => {
    process.env.GITHUB_TOKEN = originalToken;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('follows Link: rel="next" pagination and returns more than 100 issues', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => rawIssue(i + 1));
    const page2 = Array.from({ length: 50 }, (_, i) => rawIssue(i + 101));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        pageResponse(page1, '<https://api.github.com/issues?page=2>; rel="next"'),
      )
      .mockResolvedValueOnce(pageResponse(page2, null));
    vi.stubGlobal('fetch', fetchMock);

    const issues = await makeGitHubPort().listOpenIssues();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(issues.length).toBe(150);
    expect(issues[0].number).toBe(1);
    expect(issues.at(-1).number).toBe(150);
  });

  it('stops at the page cap and warns instead of truncating silently', async () => {
    const page = Array.from({ length: 100 }, (_, i) => rawIssue(i + 1));
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        pageResponse(page, '<https://api.github.com/issues?page=next>; rel="next"'),
      );
    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const issues = await makeGitHubPort().listOpenIssues();

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(issues.length).toBe(500);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('pagination cap');
  });

  it('excludes pull requests and normalizes fields on a single page', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(pageResponse([rawIssue(1), { ...rawIssue(2), pull_request: {} }]));
    vi.stubGlobal('fetch', fetchMock);

    const issues = await makeGitHubPort().listOpenIssues();

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ repo: 'hirobius/ops', number: 1 });
  });
});
