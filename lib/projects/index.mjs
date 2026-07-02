/**
 * lib/projects — live fleet status from the Vercel API.
 *
 * One read-only call to Vercel's project list (v9, includes each project's
 * latest deployments) mapped to the lean shape the /ops Live Projects surface
 * renders. This is the "ops as hub" seam: any agent or page reads ONE endpoint
 * (/api/projects) for cross-project context instead of crawling repos.
 *
 * Env (set by the human — never in .env by an agent):
 *   VERCEL_TOKEN     read-scoped Vercel access token (required to go live)
 *   VERCEL_TEAM_ID   optional team scope (team_…); omit for personal scope
 *
 * Without VERCEL_TOKEN the caller gets { ok:false, code:'ENV_MISSING_VERCEL_TOKEN' }
 * so the route can 503 and the page can render a setup hint (same graceful
 * pattern as lead-gen/agent).
 *
 * @typedef {Object} ProjectStatus
 * @property {string}      id
 * @property {string}      name
 * @property {string|null} framework
 * @property {number|null} updatedAt        epoch ms
 * @property {null | {
 *   state: string,            // READY | ERROR | BUILDING | QUEUED | CANCELED | INITIALIZING
 *   url: string|null,         // deployment host (no protocol)
 *   createdAt: number|null,
 *   target: string|null,      // 'production' | null (preview)
 *   commit: { ref: string|null, message: string|null, sha: string|null, repo: string|null },
 * }} latestDeployment
 */

const VERCEL_API = 'https://api.vercel.com';
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * @returns {Promise<{ ok: true, projects: ProjectStatus[] } | { ok: false, code: string, error: string }>}
 */
export async function listProjects() {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    return {
      ok: false,
      code: 'ENV_MISSING_VERCEL_TOKEN',
      error: 'VERCEL_TOKEN is not set — create a read-scoped token in Vercel and add it to the env.',
    };
  }

  const url = new URL('/v9/projects', VERCEL_API);
  url.searchParams.set('limit', '50');
  const teamId = process.env.VERCEL_TEAM_ID;
  if (teamId) url.searchParams.set('teamId', teamId);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      return { ok: false, code: 'VERCEL_API_ERROR', error: `Vercel ${res.status}: ${detail.slice(0, 200)}` };
    }
    const json = await res.json();
    const projects = (json.projects ?? [])
      .map(mapProject)
      .sort((a, b) => (b.latestDeployment?.createdAt ?? 0) - (a.latestDeployment?.createdAt ?? 0));
    return { ok: true, projects };
  } finally {
    clearTimeout(timer);
  }
}

/** Map one raw Vercel project → ProjectStatus. */
function mapProject(p) {
  const d = Array.isArray(p.latestDeployments) ? p.latestDeployments[0] : null;
  return {
    id: p.id,
    name: p.name,
    framework: p.framework ?? null,
    updatedAt: p.updatedAt ?? null,
    latestDeployment: d
      ? {
          state: d.readyState ?? d.state ?? 'UNKNOWN',
          url: d.url ?? null,
          createdAt: d.createdAt ?? null,
          target: d.target ?? null,
          commit: {
            ref: d.meta?.githubCommitRef ?? null,
            message: firstLine(d.meta?.githubCommitMessage),
            sha: d.meta?.githubCommitSha ? String(d.meta.githubCommitSha).slice(0, 7) : null,
            repo: d.meta?.githubCommitRepo ?? null,
          },
        }
      : null,
  };
}

function firstLine(msg) {
  if (typeof msg !== 'string' || !msg) return null;
  const line = msg.split('\n')[0];
  return line.length > 100 ? `${line.slice(0, 97)}…` : line;
}
