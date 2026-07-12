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
 * @property {(input: { issueUrl: string, label: string }) => Promise<object>} addLabel
 * @property {(input: { issueUrl: string, label: string }) => Promise<object>} removeLabel
 * @property {(input: { owner: string, repo: string, issueNumber: number|string }) => Promise<{ number: number, url: string, state: 'open'|'closed', merged: boolean, head_ref: string, created_at: string } | null>} findRalphPr
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

/** Pulls { owner, repo, number } out of an `html_url`-shaped issue link. */
function parseIssueRef(issueUrl) {
  const m = /github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/.exec(issueUrl || '');
  if (!m) {
    throw new Error(`could not parse owner/repo/issue number from URL: ${issueUrl}`);
  }
  return { owner: m[1], repo: m[2], number: m[3] };
}

/** Pulls the `rel="next"` URL out of a GitHub `Link` response header, or null past the last page. */
function parseNextLink(linkHeader) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    const m = /<([^>]+)>;\s*rel="next"/.exec(part);
    if (m) return m[1];
  }
  return null;
}

/** Hard cap on pages followed for `listOpenIssues` — 5 pages × 100/page = 500 issues. */
const LIST_ISSUES_MAX_PAGES = 5;

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
     *
     * Follows `Link: rel="next"` pagination up to LIST_ISSUES_MAX_PAGES (500
     * issues) — the fleet has well over 100 open issues, so a single 100-item
     * page silently dropped the least-recently-updated repos' issues off the
     * board (ops#143). If the cap is ever hit, warns rather than truncating
     * silently — there's more to fetch than the cap allows.
     */
    async listOpenIssues() {
      let url = 'https://api.github.com/issues?filter=all&state=open&per_page=100&sort=updated';
      const raw = [];
      let page = 0;
      let truncated = false;
      while (url) {
        page += 1;
        const res = await fetch(url, {
          headers: GH_HEADERS(token),
          signal: AbortSignal.timeout(9000),
        });
        if (res.status === 401 || res.status === 403) throw new Error(authHint(res.status));
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ''}`);
        }
        raw.push(.../** @type {any[]} */ (await res.json()));
        const next = parseNextLink(res.headers.get('link'));
        if (next && page >= LIST_ISSUES_MAX_PAGES) {
          truncated = true;
          url = null;
        } else {
          url = next;
        }
      }
      if (truncated) {
        console.warn(
          `listOpenIssues: hit the ${LIST_ISSUES_MAX_PAGES}-page pagination cap ` +
            `(${raw.length} issues fetched) — more open issues exist beyond this cap and were ` +
            `dropped from the /ops/tasks board. Raise LIST_ISSUES_MAX_PAGES in ` +
            `lib/github/issues.mjs if the fleet has grown past ${LIST_ISSUES_MAX_PAGES * 100} open issues.`,
        );
      }
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
      const { owner, repo, number } = parseIssueRef(issueUrl);
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues/${number}/comments`,
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

    /**
     * Adds a label to an issue (idempotent — GitHub no-ops if it's already
     * there). Powers the /ops/tasks "Ralph-ready" toggle (ops#88): the ops
     * board is the frictionless home for the one human touch left in the
     * autonomous engine, so this call replaces tagging the label by hand in
     * the GitHub UI.
     * @param {{ issueUrl: string, label: string }} input
     */
    async addLabel({ issueUrl, label }) {
      const { owner, repo, number } = parseIssueRef(issueUrl);
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues/${number}/labels`,
        {
          method: 'POST',
          headers: { ...GH_HEADERS(token), 'Content-Type': 'application/json' },
          body: JSON.stringify({ labels: [label] }),
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

    /**
     * Removes a label from an issue. A 404 (label already absent) is treated
     * as success — toggling an already-off label off again shouldn't error.
     * @param {{ issueUrl: string, label: string }} input
     */
    async removeLabel({ issueUrl, label }) {
      const { owner, repo, number } = parseIssueRef(issueUrl);
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues/${number}/labels/${encodeURIComponent(label)}`,
        { method: 'DELETE', headers: GH_HEADERS(token), signal: AbortSignal.timeout(9000) },
      );
      if (res.status === 401 || res.status === 403) throw new Error(authHint(res.status));
      if (res.status === 404) return { removed: false };
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${text ? ` — ${text.slice(0, 300)}` : ''}`);
      }
      return res.json().catch(() => ({ removed: true }));
    },

    /**
     * Finds the Ralph PR for a task's linked issue, by branch prefix
     * `ralph/issue-<n>-` (the shape `ralph/prompt.md` mandates). Searches all
     * PR states — not just open — so the "Approve merge" board action
     * (ops#137) can tell "no PR yet" (404) apart from "PR already
     * merged/closed" (graceful no-op) instead of treating both as not-found.
     * Multiple matches (rare — a re-run after a closed PR) resolve to the
     * newest by `created_at`.
     * @param {{ owner: string, repo: string, issueNumber: number|string }} input
     */
    async findRalphPr({ owner, repo, issueNumber }) {
      const prefix = `ralph/issue-${issueNumber}-`;
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls?state=all&per_page=100&sort=created&direction=desc`,
        { headers: GH_HEADERS(token), signal: AbortSignal.timeout(9000) },
      );
      if (res.status === 401 || res.status === 403) throw new Error(authHint(res.status));
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${text ? ` — ${text.slice(0, 300)}` : ''}`);
      }
      const prs = /** @type {any[]} */ (await res.json());
      const matches = prs.filter(
        (pr) => typeof pr.head?.ref === 'string' && pr.head.ref.startsWith(prefix),
      );
      if (!matches.length) return null;
      matches.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const pr = matches[0];
      return {
        number: pr.number,
        url: pr.html_url,
        state: pr.state,
        merged: !!pr.merged_at,
        head_ref: pr.head.ref,
        created_at: pr.created_at,
      };
    },
  };
}
