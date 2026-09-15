/**
 * lib/tasks/fleet-status.mjs — the fleet-wide Standing read, port-injected.
 *
 * Lives here rather than inside `api/tasks.ts` so the dev middleware
 * (`scripts/tasks-middleware.mjs`) and the Vercel function serve byte-identical
 * payloads from one implementation — the `?ralph=1` lane has no dev mirror, and
 * the result is that its panel can only ever be exercised in production.
 *
 * Takes the GitHub port (ADR-0004) rather than reading env, so it is testable
 * against a stub with no token and no global fetch mock.
 */

import { openPrSearchQuery, ownersOf, sortFleetLanes } from './fleet.mjs';

const NO_TOKEN = {
  status: 503,
  body: {
    error:
      'GITHUB_TOKEN not set — needed for the fleet Standing view. Add it in Vercel → ' +
      'Settings → Environment Variables (Production + Preview), then redeploy.',
    code: 'ENV_MISSING_GITHUB_TOKEN',
  },
};

function messageOf(err) {
  return err instanceof Error ? err.message : String(err);
}

/**
 * The repo set is DISCOVERED, never configured: `listOpenIssues()` is GitHub's
 * authenticated-identity feed — every open issue in every repo the token can
 * see, across every owner — so a repo joins this view by existing. The sibling
 * `?ralph=1` read fans out over a hardcoded FLEET_REPOS list and cannot see a
 * new repo until someone edits it.
 *
 * Cost is flat in the number of repos: up to 5 paginated issue requests plus
 * ONE PR search whose owner qualifiers come from the issues that came back. A
 * per-repo fan-out over a discovered set would grow without bound on every poll.
 *
 * @param {ReturnType<import('../github/issues.mjs').makeGitHubPort>} gh
 */
export async function buildFleetStatus(gh) {
  if (!gh) return NO_TOKEN;

  let issues;
  try {
    issues = await gh.listOpenIssues();
  } catch (err) {
    return { status: 502, body: { error: messageOf(err), code: 'GITHUB_FLEET_ISSUES_FAILED' } };
  }

  const { blocked, queue, repos } = sortFleetLanes(issues);
  const owners = ownersOf(repos);

  const errors = [];
  let prs = [];
  try {
    prs = await gh.searchOpenPrs({ query: openPrSearchQuery(owners) });
  } catch (err) {
    // Named, never swallowed: PR search has its own, much tighter rate limit
    // (30/min), and an empty lane that silently meant "rate-limited" would read
    // as "nothing is in flight".
    errors.push({ repo: owners.join(', ') || 'fleet', error: `PR search: ${messageOf(err)}` });
  }

  return {
    status: 200,
    body: {
      owners,
      repos,
      blocked,
      queue,
      prs,
      errors,
      counts: { openIssues: issues.length, repos: repos.length },
    },
  };
}
