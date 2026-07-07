/**
 * Vercel Serverless Function — GET /api/projects
 *
 * Aggregates each fleet repo's root `status.json` LIVE from the GitHub Contents
 * API so the ops dashboard reflects a repo's status the moment it lands on that
 * repo's default branch — no ops redeploy. In development this same contract is
 * served by the Vite middleware in vite.config.mjs.
 *
 * ── Environment Variables (set by human in the Vercel dashboard — never in .env) ─
 *   GITHUB_TOKEN   A PAT (fine-grained or classic) with `Contents: read` on the
 *                  fleet repos. Private repos require it. If unset, the function
 *                  returns 503 with setup instructions.
 *
 * ── Query ────────────────────────────────────────────────────────────────────
 *   ?ref=<branch>  Optional. Preview a specific branch's status.json for every
 *                  repo (default: each repo's own default branch).
 *
 * ── Response ─────────────────────────────────────────────────────────────────
 *   200 { generatedAt, projects: [{ owner, repo, label, ref, htmlUrl,
 *         ok, status?: { updatedAt, phase, headline, next[], blocked[] }, error? }] }
 *   503 { error, code: 'ENV_MISSING_GITHUB_TOKEN' }   — token not set
 *   502 { error, code: 'FLEET_STATUS_FAILED' }        — aggregation threw
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    res.status(503).json({
      error:
        'GITHUB_TOKEN is not set. Add a PAT with Contents:read on the fleet repos in the Vercel project environment variables.',
      code: 'ENV_MISSING_GITHUB_TOKEN',
    });
    return;
  }

  const ref = typeof req.query.ref === 'string' && req.query.ref.trim() ? req.query.ref.trim() : undefined;

  try {
    // Lazy import keeps the pure core out of the cold-start path until needed
    // and mirrors the guarded-import idiom used elsewhere in the repo.
    const { fetchFleetStatus } = await import('../lib/fleet-status.mjs');
    const data = await fetchFleetStatus({ token, ref });
    // Near-immediate at the edge, but coalesce bursts + serve stale while revalidating.
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : String(err),
      code: 'FLEET_STATUS_FAILED',
    });
  }
}
