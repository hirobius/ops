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
    await attachRepoStatuses(projects); // no-op until GITHUB_TOKEN is set
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
            org: d.meta?.githubCommitOrg ?? d.meta?.githubOrg ?? null,
          },
        }
      : null,
    repoStatus: null, // filled by attachRepoStatuses when GITHUB_TOKEN is set
  };
}

function firstLine(msg) {
  if (typeof msg !== 'string' || !msg) return null;
  const line = msg.split('\n')[0];
  return line.length > 100 ? `${line.slice(0, 97)}…` : line;
}

// ── Per-repo status.json (the fleet-status convention) ───────────────────────
//
// Each fleet repo keeps a small `status.json` at its root — the narrative layer
// deploys can't express (phase, headline, blocked). Written by whoever works
// the repo (the onboarding prompt makes agents keep it fresh); read here via
// the GitHub contents API and attached as `repoStatus`.
//
// Token-gated: without GITHUB_TOKEN we skip silently (unauthenticated GitHub
// calls rate-limit at 60/hr/IP — one open dashboard tab would exhaust that in
// minutes). With the token: 5k/hr + private repos work. A module-scope TTL
// cache keeps warm lambdas polite either way.

const STATUS_TTL_MS = 5 * 60 * 1000;
const STATUS_TIMEOUT_MS = 4_000;
/** @type {Map<string, { at: number, value: object|null }>} */
const statusCache = new Map();

/**
 * Fetch + attach each project's repo status.json (mutates `repoStatus`).
 * No-op without GITHUB_TOKEN. Failures per repo → null (never throws).
 * @param {Array<{latestDeployment: null | { commit: { org: string|null, repo: string|null } }, repoStatus: object|null}>} projects
 */
export async function attachRepoStatuses(projects) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return projects;

  // Dedupe org/repo pairs (several Vercel projects can share one repo).
  const keys = new Map();
  for (const p of projects) {
    const c = p.latestDeployment?.commit;
    if (c?.org && c?.repo) keys.set(`${c.org}/${c.repo}`, { org: c.org, repo: c.repo });
  }

  const results = new Map();
  await Promise.allSettled(
    [...keys.entries()].map(async ([key, { org, repo }]) => {
      results.set(key, await fetchRepoStatus(org, repo, token));
    }),
  );

  for (const p of projects) {
    const c = p.latestDeployment?.commit;
    if (c?.org && c?.repo) p.repoStatus = results.get(`${c.org}/${c.repo}`) ?? null;
  }
  return projects;
}

/** One repo's status.json via the contents API (raw), TTL-cached. @returns {Promise<object|null>} */
async function fetchRepoStatus(org, repo, token) {
  const key = `${org}/${repo}`;
  const hit = statusCache.get(key);
  if (hit && Date.now() - hit.at < STATUS_TTL_MS) return hit.value;

  let value = null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), STATUS_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.github.com/repos/${org}/${repo}/contents/status.json`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.raw+json',
      },
      signal: ctrl.signal,
    });
    if (res.ok) value = pickStatus(await res.json());
  } catch {
    value = null; // absent file / network / parse — all non-fatal
  } finally {
    clearTimeout(timer);
  }
  statusCache.set(key, { at: Date.now(), value });
  return value;
}

/** Tolerant schema pick — keep known fields, clamp lengths, ignore junk. */
function pickStatus(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const list = (v, max) =>
    Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, max) : [];
  const status = {
    updatedAt: str(raw.updatedAt, 40),
    phase: str(raw.phase, 24),
    headline: str(raw.headline, 120),
    next: list(raw.next, 3),
    blocked: list(raw.blocked, 3),
  };
  return status.headline || status.phase || status.blocked.length ? status : null;
}
