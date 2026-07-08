/**
 * lib/github/issues.mjs — the GitHub Issues adapter (production impl of the port).
 *
 * makeGitHubPort() reads GITHUB_TOKEN / GITHUB_REPO and returns a port —
 * { createIssue({ title, body }): Promise<{ html_url }> } — or null when no token
 * is configured (callers map null to 503). Isolating the env read + fetch here lets
 * lib/tasks/actions.mjs's dispatch take the port injected and be testable with a
 * stub: no env, no global fetch mock. (ADR-0004 sibling: ports and adapters.)
 *
 * @typedef {object} GitHubIssuePort
 * @property {(input: { title: string, body: string }) => Promise<{ html_url: string }>} createIssue
 * @property {() => Promise<Array<{ repo: string, number: number, title: string, url: string, state: string, labels: string[], updated_at: string }>>} listOpenIssues
 * @property {(input: { issueUrl: string, body: string }) => Promise<object>} commentOnIssue
 */

const GH_HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'hirobius-ops',
});

/** Actionable message when GitHub rejects the token (expired/revoked/wrong scope). */
function authHint(status) {
  return (
    `GitHub returned ${status}. GITHUB_TOKEN is expired, revoked, or missing the ` +
    `"Issues: read/write" permission — rotate it in Vercel → Settings → ` +
    `Environment Variables (Production), then redeploy.`
  );
}

/**
 * Build the production GitHub issue port from env, or null if unconfigured.
 * @returns {GitHubIssuePort | null}
 */
export function makeGitHubPort() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  const repo = process.env.GITHUB_REPO || 'hirobius/ops';

  return {
    async createIssue({ title, body }) {
      const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: 'POST',
        headers: { ...GH_HEADERS(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
        signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${text ? ` — ${text.slice(0, 300)}` : ''}`);
      }
      return res.json();
    },

    /**
     * Every open issue across all repos the token can see ("all my repos at a
     * glance"). Uses GET /issues?filter=all — the authenticated-identity feed —
     * and drops PRs (the endpoint mixes them in). Normalized + repo-tagged.
     */
    async listOpenIssues() {
      const res = await fetch(
        'https://api.github.com/issues?filter=all&state=open&per_page=100&sort=updated',
        { headers: GH_HEADERS(token), signal: AbortSignal.timeout(9000) },
      );
      if (res.status === 401 || res.status === 403) throw new Error(authHint(res.status));
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ''}`);
      }
      const raw = /** @type {any[]} */ (await res.json());
      return raw
        .filter((i) => !i.pull_request) // /issues includes PRs — exclude them
        .map((i) => ({
          repo: String(i.repository_url || '').replace('https://api.github.com/repos/', ''),
          number: i.number,
          title: i.title,
          url: i.html_url,
          state: i.state,
          labels: Array.isArray(i.labels) ? i.labels.map((l) => l.name).filter(Boolean) : [],
          updated_at: i.updated_at,
        }));
    },

    /**
     * Leaves a comment on an existing issue, given its `html_url` (as stored
     * in `tasks.dispatch_url`). Used by the Slice 5 stale-dispatch watchdog
     * to re-ping `@claude` on a stalled dispatch without opening a duplicate
     * issue. Parses owner/repo/number out of the URL rather than requiring
     * callers to already have them split out.
     * @param {{ issueUrl: string, body: string }} input
     */
    async commentOnIssue({ issueUrl, body }) {
      const m = /github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/.exec(issueUrl || '');
      if (!m) {
        throw new Error(
          `commentOnIssue: could not parse owner/repo/issue number from URL: ${issueUrl}`,
        );
      }
      const [, owner, repoName, number] = m;
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repoName}/issues/${number}/comments`,
        {
          method: 'POST',
          headers: { ...GH_HEADERS(token), 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
          signal: AbortSignal.timeout(9000),
        },
      );
      if (res.status === 401 || res.status === 403) throw new Error(authHint(res.status));
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${text ? ` — ${text.slice(0, 300)}` : ''}`);
      }
      return res.json();
    },
  };
}
