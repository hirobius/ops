/**
 * Vercel Serverless Function — GET /api/issues
 *
 * Read side for the /ops/issues board: every open GitHub issue across all repos
 * the GITHUB_TOKEN can see ("all my repos at a glance"). Server-side, so the
 * token never reaches the browser. Ops-gated; no Supabase.
 *
 * Success:  { issues: Issue[] } · Error: { error, code? } 401/405/503
 *
 * Env (server-only): GITHUB_TOKEN (fine-grained, Issues: read across the repos).
 */

import type { VercelRequest } from '@vercel/node';
import { withOpsHandler, messageOf, type HandlerResult } from '../lib/api/handler.js';
import { makeGitHubPort } from '../lib/github/issues.mjs';

export async function issuesHandler(_req: VercelRequest): Promise<HandlerResult> {
  const gh = makeGitHubPort();
  if (!gh) {
    return {
      status: 503,
      body: {
        error:
          'GITHUB_TOKEN not set — needed to read GitHub issues. Add it in Vercel → ' +
          'Settings → Environment Variables (Production), then redeploy.',
        code: 'ENV_MISSING_GITHUB_TOKEN',
      },
    };
  }
  try {
    const issues = await gh.listOpenIssues();
    return { status: 200, body: { issues } };
  } catch (err) {
    // authHint() messages already name GITHUB_TOKEN + the fix.
    return { status: 502, body: { error: messageOf(err), code: 'GITHUB_LIST_FAILED' } };
  }
}

export default withOpsHandler('GET', issuesHandler);
