/**
 * lib/github/issues.mjs — the GitHub Issues adapter (production impl of the port).
 *
 * makeGitHubPort() reads GITHUB_TOKEN / GITHUB_REPO and returns a port —
 * { createIssue({ title, body }): Promise<{ html_url }> } — or null when no token
 * is configured (callers map null to 503). Isolating the env read + fetch here lets
 * lib/tasks/actions.mjs's dispatch take the port injected and be testable with a
 * stub: no env, no global fetch mock. (ADR-0004 sibling: ports and adapters.)
 *
 * @typedef {{ createIssue: (input: { title: string, body: string }) => Promise<{ html_url: string }> }} GitHubIssuePort
 */

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
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'hirobius-ops',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, body }),
        signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${text ? ` — ${text.slice(0, 300)}` : ''}`);
      }
      return res.json();
    },
  };
}
