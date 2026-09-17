/**
 * lib/pii/github-text.mjs — collecting recently updated issue and PR text for
 * the weekly PII scan. GitHub is faked with an injected fetch; all text is
 * synthetic.
 */
import { describe, it, expect } from 'vitest';
import {
  commitMessageText,
  fetchRecentText,
  pullRequestEventText,
} from '../../lib/pii/github-text.mjs';

function fakeGitHub(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), auth: init?.headers?.Authorization });
    const route = routes[String(url)];
    if (!route) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: route.link ? { Link: route.link } : {},
    });
  };
  return { fetchImpl, calls };
}

const API = 'https://api.github.com/repos/hirobius/ops';
const SINCE = '2026-09-08T00:00:00.000Z';

describe('fetchRecentText', () => {
  it('collects titles, bodies, issue comments and review comments updated since the cutoff', async () => {
    const issues1 = `${API}/issues?state=all&since=${encodeURIComponent(SINCE)}&per_page=100`;
    const issues2 = `${API}/issues?state=all&since=${encodeURIComponent(SINCE)}&per_page=100&page=2`;
    const { fetchImpl, calls } = fakeGitHub({
      [issues1]: {
        body: [{ number: 5, title: 'Fix header', body: 'Body five' }],
        link: `<${issues2}>; rel="next", <${issues2}>; rel="last"`,
      },
      [issues2]: { body: [{ number: 6, title: 'PR six', body: null, pull_request: {} }] },
      [`${API}/issues/comments?since=${encodeURIComponent(SINCE)}&per_page=100`]: {
        body: [{ id: 91, body: 'A comment', issue_url: `${API}/issues/5` }],
      },
      [`${API}/pulls/comments?since=${encodeURIComponent(SINCE)}&per_page=100`]: {
        body: [{ id: 77, body: 'Nit', pull_request_url: `${API}/pulls/6` }],
      },
    });

    const records = await fetchRecentText({
      repo: 'hirobius/ops',
      since: SINCE,
      token: 't0k',
      fetchImpl,
    });
    expect(records).toEqual([
      { location: 'hirobius/ops#5 title', text: 'Fix header' },
      { location: 'hirobius/ops#5 body', text: 'Body five' },
      { location: 'hirobius/ops#6 title', text: 'PR six' },
      { location: 'hirobius/ops#5 comment 91', text: 'A comment' },
      { location: 'hirobius/ops#6 review comment 77', text: 'Nit' },
    ]);
    expect(calls.every((c) => c.auth === 'Bearer t0k')).toBe(true);
  });

  it('fails loud, naming GITHUB_TOKEN and the permissions, when GitHub refuses the token', async () => {
    const { fetchImpl } = fakeGitHub({
      [`${API}/issues?state=all&since=${encodeURIComponent(SINCE)}&per_page=100`]: {
        status: 401,
        body: { message: 'Bad credentials' },
      },
    });
    await expect(
      fetchRecentText({ repo: 'hirobius/ops', since: SINCE, token: 'bad', fetchImpl }),
    ).rejects.toThrow(/GITHUB_TOKEN.*401.*issues: read.*pull-requests: read/);
  });
});

describe('pullRequestEventText', () => {
  it('returns the title, body and head branch name of a pull_request event', () => {
    expect(
      pullRequestEventText('pull_request', {
        pull_request: { title: 'Site for a client', body: 'Details', head: { ref: 'client-site' } },
      }),
    ).toEqual([
      { location: 'pull request title', text: 'Site for a client' },
      { location: 'pull request body', text: 'Details' },
      { location: 'pull request branch name', text: 'client-site' },
    ]);
  });

  it('skips an empty body and returns nothing for other events', () => {
    expect(
      pullRequestEventText('pull_request', { pull_request: { title: 'T', body: null, head: {} } }),
    ).toEqual([{ location: 'pull request title', text: 'T' }]);
    expect(pullRequestEventText('push', { pull_request: { title: 'T' } })).toEqual([]);
  });
});

describe('commitMessageText', () => {
  it('blanks comment lines (keeping line numbers) and drops everything from the scissors line down', () => {
    const raw = [
      'subject',
      '# comment',
      'body',
      '# ------------------------ >8 ------------------------',
      '+diff',
    ].join('\n');
    expect(commitMessageText(raw)).toBe('subject\n\nbody');
  });

  it('honours a custom comment character', () => {
    expect(commitMessageText('subject\n; note\n# kept', { commentChar: ';' })).toBe(
      'subject\n\n# kept',
    );
  });
});
