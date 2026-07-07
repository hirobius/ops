/**
 * Fleet-status aggregator — the pure core behind GET /api/projects.
 *
 * Reads each fleet repo's root `status.json` LIVE from the GitHub Contents API
 * (default branch unless a ref is given) at request time, so the ops dashboard
 * reflects a repo's status the moment it lands on that repo's default branch —
 * no ops redeploy. The serverless handler (api/projects.ts) and the Vite dev
 * middleware (vite.config.mjs) are thin wrappers over `fetchFleetStatus()`.
 *
 * status.json contract (see the fleet convention in clients/CLAUDE.md):
 *   { updatedAt, phase, headline, next: string[], blocked: string[] }
 *
 * Pure + injectable: pass `fetchImpl` (defaults to global fetch) and `now` so
 * the whole thing is unit-testable offline with a mock fetch.
 */

/** The repos whose root status.json the dashboard aggregates. Add rows to extend. */
export const FLEET_REPOS = [
  { owner: 'hirobius', repo: 'clients', label: 'Clients — site factory' },
  { owner: 'hirobius', repo: 'ops', label: 'Ops — fleet hub' },
];

/** Recognized phase values; anything else is passed through verbatim. */
const KNOWN_PHASES = new Set(['planning', 'active', 'blocked', 'paused', 'shipped']);

/** Coerce a parsed status.json into the dashboard shape; tolerant of missing fields. */
export function normalizeStatus(raw) {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const strArray = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string') : []);
  return {
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : null,
    phase: typeof obj.phase === 'string' ? obj.phase : null,
    phaseKnown: typeof obj.phase === 'string' && KNOWN_PHASES.has(obj.phase),
    headline: typeof obj.headline === 'string' ? obj.headline : '',
    next: strArray(obj.next),
    blocked: strArray(obj.blocked),
  };
}

/** Fetch + normalize one repo's status.json. Never throws — returns an ok/err row. */
export async function fetchRepoStatus(entry, { token, fetchImpl = fetch, ref } = {}) {
  const { owner, repo } = entry;
  const branchRef = ref ?? entry.ref ?? null;
  const label = entry.label ?? `${owner}/${repo}`;
  const base = {
    owner,
    repo,
    label,
    ref: branchRef,
    htmlUrl: `https://github.com/${owner}/${repo}/blob/${branchRef ?? 'HEAD'}/status.json`,
  };

  const url =
    `https://api.github.com/repos/${owner}/${repo}/contents/status.json` +
    (branchRef ? `?ref=${encodeURIComponent(branchRef)}` : '');

  let res;
  try {
    res = await fetchImpl(url, {
      headers: {
        Accept: 'application/vnd.github.raw+json',
        'User-Agent': 'hirobius-ops-fleet-status',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    return { ...base, ok: false, error: `unreachable: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (res.status === 404) {
    return { ...base, ok: false, error: 'no status.json on this ref yet' };
  }
  if (!res.ok) {
    return { ...base, ok: false, error: `GitHub HTTP ${res.status}` };
  }

  let text;
  try {
    text = await res.text();
  } catch {
    return { ...base, ok: false, error: 'could not read response body' };
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ...base, ok: false, error: 'status.json is not valid JSON' };
  }

  return { ...base, ok: true, status: normalizeStatus(parsed) };
}

/** Aggregate every fleet repo's status concurrently. Never rejects on a per-repo failure. */
export async function fetchFleetStatus({ repos = FLEET_REPOS, token, fetchImpl = fetch, ref, now } = {}) {
  const projects = await Promise.all(repos.map((r) => fetchRepoStatus(r, { token, fetchImpl, ref })));
  return { generatedAt: now ?? new Date().toISOString(), projects };
}
