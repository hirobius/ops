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

import {
  openPrSearchQuery,
  ownersOf,
  ralphRepos,
  sortFleetLanes,
  summarizeLoop,
} from './fleet.mjs';
import { leadFunnel, publishedUrls } from '../supabase/leads.mjs';
import { CHAIN_ENV_KEYS } from '../chain/stages.mjs';
import { probeUrls, summarizeLiveness } from '../chain/liveness.mjs';

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
 * The chain half is separate and deliberately NOT from GitHub: it is the lead
 * funnel straight out of Supabase plus which env vars are present. Both are
 * facts, so the page derives every verdict about the pipeline instead of being
 * told one (lib/chain/evidence.mjs). Supabase being unavailable degrades the
 * chain to "unknown" rather than to zeros — the lanes still render.
 *
 * @param {ReturnType<import('../github/issues.mjs').makeGitHubPort>} gh
 * @param {{ sb?: import('@supabase/supabase-js').SupabaseClient|null, env?: Record<string, string|undefined> }} [ctx]
 */
export async function buildFleetStatus(gh, ctx = {}) {
  if (!gh) return NO_TOKEN;

  let issues;
  let truncated = false;
  try {
    const sweep = await gh.listOpenIssues();
    issues = sweep.issues;
    truncated = sweep.truncated;
  } catch (err) {
    return { status: 502, body: { error: messageOf(err), code: 'GITHUB_FLEET_ISSUES_FAILED' } };
  }

  const { blocked, queue, backlog, sev1, repos, total } = sortFleetLanes(issues);
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

  // Whether the loop is actually turning. One request per ralph-labelled repo
  // (bounded by ralphRepos) — the only per-repo fan-out on this read, and it
  // buys the difference between "nothing to do" and "nothing is running".
  let loop = [];
  try {
    loop = summarizeLoop(await gh.listRalphRuns({ repos: ralphRepos(issues) }));
  } catch (err) {
    errors.push({ repo: 'fleet', error: `loop runs: ${messageOf(err)}` });
  }

  const { funnel, funnelError } = await readFunnel(ctx.sb);
  if (funnelError) errors.push({ repo: 'supabase', error: `lead funnel: ${funnelError}` });

  // ops#322: stage 5 is the one link a dead URL can "prove". Never fatal — a
  // failed probe degrades to null ("no probe ran"), never to a zeroed summary.
  const liveness = await readLiveness(ctx.sb);

  return {
    status: 200,
    body: {
      owners,
      repos,
      blocked,
      queue,
      backlog,
      // ops#317: every open sev1 across the fleet, so the page leads with it.
      sev1,
      total,
      prs,
      loop,
      errors,
      // True when the sweep hit its pagination cap. The page claims to show the
      // whole board, so it has to be able to say when it cannot.
      truncated,
      funnel,
      liveness,
      // Presence only, never values — the page needs to say "SMARTLEAD_API_KEY
      // is missing", and a boolean is the whole of what that requires.
      env: envPresence(ctx.env ?? process.env),
      counts: { openIssues: issues.length, repos: repos.length },
    },
  };
}

/** @returns {{ funnel: Record<string, number|null>, funnelError: string|null }} */
async function readFunnel(sb) {
  if (!sb) {
    return {
      funnel: {},
      funnelError: 'no Supabase client — chain stages report as unmeasured',
    };
  }
  try {
    const { data, error } = await leadFunnel(sb);
    if (error) return { funnel: {}, funnelError: messageOf(error) };
    return { funnel: data ?? {}, funnelError: null };
  } catch (err) {
    return { funnel: {}, funnelError: messageOf(err) };
  }
}

/**
 * Stage 5 liveness (ops#322). Runs HERE, on the server, because the browser
 * cannot HEAD a third-party origin and the Vercel function has unrestricted
 * egress. `probeUrls` caches per URL, so a poll costs nothing once warm.
 *
 * Returns null — "no probe ran" — rather than a zeroed summary whenever it
 * cannot ask. A summary of all-zero would read as "nothing is up", which is a
 * different and much worse claim.
 *
 * @returns {Promise<{stored:number,live:number,dead:number,unchecked:number}|null>}
 */
async function readLiveness(sb) {
  if (!sb) return null;
  try {
    const { data, error } = await publishedUrls(sb);
    if (error || !Array.isArray(data) || !data.length) return null;
    return summarizeLiveness(await probeUrls(data));
  } catch {
    return null;
  }
}

/** Which chain env vars are set. Booleans only — no value ever leaves the server. */
function envPresence(env) {
  return Object.fromEntries(
    CHAIN_ENV_KEYS.map((k) => [k, typeof env[k] === 'string' && env[k].length > 0]),
  );
}
