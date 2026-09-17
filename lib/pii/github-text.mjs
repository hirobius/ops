/**
 * lib/pii/github-text — issue and PR text updated since a cutoff, as scan
 * records for scripts/check-pii.mjs --records.
 *
 * Covers what people paste into: issue/PR titles and bodies, issue and PR
 * conversation comments, and PR review (diff) comments. NOT covered: the edit
 * history of those texts (GraphQL userContentEdits). The 2026-09-16 sweep found
 * client names surviving only in old revisions, so a hit here means "edit the
 * text AND delete the old revision" — see docs/guardrails/pii-gate.md.
 *
 * @module pii/github-text
 */

const API = 'https://api.github.com';

/**
 * @param {object} options
 * @param {string} options.repo        owner/name
 * @param {string} options.since       ISO timestamp; items updated at or after it
 * @param {string} options.token       GitHub token with issues:read + pull-requests:read
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<{ location: string, text: string }[]>}
 */
export async function fetchRecentText({ repo, since, token, fetchImpl = fetch }) {
  const base = `${API}/repos/${repo}`;
  const query = `since=${encodeURIComponent(since)}&per_page=100`;
  const get = (url) => paginate(url, { token, fetchImpl });
  const records = [];
  const push = (location, text) => {
    if (typeof text === 'string' && text.trim() !== '') records.push({ location, text });
  };

  for (const item of await get(`${base}/issues?state=all&${query}`)) {
    push(`${repo}#${item.number} title`, item.title);
    push(`${repo}#${item.number} body`, item.body);
  }
  for (const c of await get(`${base}/issues/comments?${query}`)) {
    push(`${repo}#${trailingNumber(c.issue_url)} comment ${c.id}`, c.body);
  }
  for (const c of await get(`${base}/pulls/comments?${query}`)) {
    push(`${repo}#${trailingNumber(c.pull_request_url)} review comment ${c.id}`, c.body);
  }
  return records;
}

async function paginate(firstUrl, { token, fetchImpl }) {
  const items = [];
  let url = firstUrl;
  while (url) {
    const res = await fetchImpl(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) {
      const refused = [401, 403, 404].includes(res.status);
      throw new Error(
        `GitHub API ${res.status} for ${url.replace(/\?.*/, '')}.` +
          (refused
            ? ` GITHUB_TOKEN was refused (${res.status}): in Actions pass \`GITHUB_TOKEN: \${{ github.token }}\` with job permissions \`issues: read\` and \`pull-requests: read\`; locally use \`GITHUB_TOKEN=$(gh auth token)\`.`
            : ''),
      );
    }
    const page = await res.json();
    if (Array.isArray(page)) items.push(...page);
    url = nextLink(res.headers.get('link'));
  }
  return items;
}

function nextLink(header) {
  const match = /<([^>]+)>;\s*rel="next"/.exec(header ?? '');
  return match ? match[1] : null;
}

function trailingNumber(url) {
  return String(url ?? '')
    .split('/')
    .pop();
}
