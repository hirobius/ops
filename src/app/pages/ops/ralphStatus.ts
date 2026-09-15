/**
 * ralphStatus — the shape of GET /api/tasks?ralph=1, and the one fetcher for it.
 *
 * Two surfaces read this endpoint: the Tasks board's RalphPanel (four operating
 * lanes with a re-queue action) and the Standing page (the same fleet state,
 * read-only, arranged around the revenue chain). They share the contract here
 * rather than each re-declaring it, so a server-side field change breaks one
 * place instead of drifting silently between two.
 *
 * Labels ARE the loop's state store — this endpoint reads GitHub directly and
 * never consults the Supabase mirror, so it is the non-stale fleet read.
 */

export interface RalphRun {
  number: number;
  status: string;
  conclusion: string | null;
  title: string;
  url: string;
  started_at: string;
}

export interface RalphRepoRuns {
  repo: string;
  runs: RalphRun[];
  error?: string;
}

export interface RalphQueueItem {
  repo: string;
  number: number;
  title: string;
  url: string;
  prio: string | null;
  wip: boolean;
}

export interface RalphParkedItem {
  repo: string;
  number: number;
  title: string;
  url: string;
  label: 'ralph-parked' | 'needs-adrian';
  reason: string | null;
  hint: string | null;
}

export interface RalphPrItem {
  repo: string;
  number: number;
  url: string;
  title: string;
  wedged: boolean;
  wedgeReason: string | null;
}

export interface RalphStatus {
  runs: RalphRepoRuns[];
  queue: RalphQueueItem[];
  parked: RalphParkedItem[];
  prs: RalphPrItem[];
  errors: { repo: string; error: string }[];
}

/**
 * The shared read. Throws the backend's own named message on a non-2xx so the
 * caller can render it verbatim — a missing GITHUB_TOKEN must never degrade to
 * a generic "unreachable" (ops#204: the loop depends on that token, so losing
 * it cannot be a silent no-op).
 */
export async function fetchRalphStatus(signal: AbortSignal): Promise<RalphStatus> {
  const res = await fetch('/api/tasks?ralph=1', { signal });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      isRecord(body) && typeof body['error'] === 'string'
        ? (body['error'] as string)
        : `HTTP ${res.status}`;
    throw new Error(message);
  }
  if (!isRalphStatus(body)) {
    // A 200 that isn't the payload means something stood in for the function —
    // a dev server serving index.html, a proxy, a rewrite. Rendering that as
    // four empty lanes would read as "nothing is waiting on you", which is the
    // most dangerous wrong answer this endpoint can give.
    throw new Error(
      'GET /api/tasks?ralph=1 returned 200 with a body that is not the fleet ' +
        'payload — the serverless function did not handle this request.',
    );
  }
  return body;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** The four lanes are the contract; anything missing one of them is not it. */
function isRalphStatus(v: unknown): v is RalphStatus {
  return (
    isRecord(v) &&
    Array.isArray(v['runs']) &&
    Array.isArray(v['queue']) &&
    Array.isArray(v['parked']) &&
    Array.isArray(v['prs'])
  );
}

/** `hirobius/ops` → `ops`. The owner is constant across the fleet panel. */
export function shortRepo(full: string): string {
  return full.slice(full.indexOf('/') + 1);
}
