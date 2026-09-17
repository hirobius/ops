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

/* ── the fleet-wide read: GET /api/tasks?fleet=1 ──────────────────────────── */

export interface FleetIssue {
  repo: string;
  number: number;
  title: string;
  url: string;
  /** The label that put it in this lane: a blocking label, or 'ralph-parked'. */
  label: string | null;
  prio: string | null;
  /**
   * Whole days since the issue was OPENED, or null when unmeasurable.
   *
   * Deliberately not "days since last touched": the loop rewrites labels
   * constantly and every write bumps `updated_at`, so that clock would bury
   * exactly the issues automation keeps poking. Null means "cannot say" and
   * sorts last — never 0, which would read as "arrived today".
   */
  ageDays: number | null;
  /** Days since anything touched it. Context beside `ageDays`, never the sort key. */
  quietDays: number | null;
  /** Every label, not just the one that chose the lane. */
  labels: string[];
  comments: number;
  assignee: string | null;
  /**
   * Whether the body carries a `- [ ]` checklist.
   *
   * `ralph/next.sh` parks a DoD-less issue on sight, so a row without one will
   * bounce the moment it is queued. Better to see that before tapping Queue
   * than to spend an iteration discovering it.
   */
  hasDod: boolean;
  /** First readable sentence of the body, markdown stripped. */
  excerpt: string;
  queued: boolean;
  auto: boolean;
  wip: boolean;
}

export interface FleetPr {
  repo: string;
  number: number;
  url: string;
  title: string;
  draft: boolean;
  updatedAt: string;
  labels: string[];
}

/**
 * Whether the Ralph loop is turning, per repo it runs in.
 *
 * `unknown` is a real answer, not a missing one — a repo whose runs could not
 * be read has NOT been observed to be quiet, and conflating the two would let a
 * permission failure render as a healthy idle loop.
 */
export interface LoopState {
  repo: string;
  state: 'running' | 'failed' | 'idle' | 'unknown';
  run: { number: number; title: string; url: string } | null;
  /** Hours since the newest run started; null while one is still running. */
  quietHours: number | null;
  conclusion: string | null;
  error: string | null;
}

export interface FleetStatus {
  /** Lead-table counts per chain stage; null where a stage is not measurable. */
  funnel: Record<string, number | null>;
  /**
   * Stage-5 liveness (ops#322), or null when no probe ran. Null is NOT a zeroed
   * summary: "we did not ask" and "nothing is up" are different claims.
   */
  liveness: { stored: number; live: number; dead: number; unchecked: number } | null;
  /** Which chain env vars are SET. Presence only — no value ever leaves the server. */
  env: Record<string, boolean>;
  /** Owners actually scanned — derived from the issues, never configured. */
  owners: string[];
  /** Repos that appeared in the sweep. This IS the fleet. */
  repos: string[];
  blocked: FleetIssue[];
  /** Same row shape as every other lane — see FleetIssue. Order is the selector's. */
  queue: FleetIssue[];
  /** Everything not blocked, parked or queued. The rest of the board. */
  backlog: FleetIssue[];
  /**
   * Every open sev1 across the fleet (ops#317). A call-out, not a lane: each one
   * also sits in whichever lane its other labels put it in.
   */
  sev1: FleetIssue[];
  /** Every open issue the sweep saw — blocked + queue + backlog. */
  total: number;
  prs: FleetPr[];
  /** Per-repo loop state. Empty is legitimate: no repo carries a ralph-* label. */
  loop: LoopState[];
  /**
   * The sweep hit its pagination cap and this is NOT the whole board.
   *
   * Surfaced rather than logged: a page that claims to show everything has to
   * be able to say when it does not.
   */
  truncated: boolean;
  errors: { repo: string; error: string }[];
  counts: { openIssues: number; repos: number };
}

/**
 * The Standing page's read. Same fail-loud contract as the Ralph panel's: a
 * 200 that is not this payload is a hard error, never four empty lanes.
 */
export async function fetchFleetStatus(signal: AbortSignal): Promise<FleetStatus> {
  const res = await fetch('/api/tasks?fleet=1', { signal });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      isRecord(body) && typeof body['error'] === 'string'
        ? (body['error'] as string)
        : `HTTP ${res.status}`;
    throw new Error(message);
  }
  if (!isFleetStatus(body)) {
    throw new Error(
      'GET /api/tasks?fleet=1 returned 200 with a body that is not the fleet ' +
        'payload — the serverless function did not handle this request.',
    );
  }
  return body;
}

function isFleetStatus(v: unknown): v is FleetStatus {
  return (
    isRecord(v) &&
    Array.isArray(v['repos']) &&
    Array.isArray(v['blocked']) &&
    Array.isArray(v['queue']) &&
    Array.isArray(v['backlog']) &&
    // Required, not optional: a missing list would render as "no open sev1",
    // the all-clear reading (ops#317).
    Array.isArray(v['sev1']) &&
    Array.isArray(v['prs'])
  );
}

/** `hirobius/ops` → `ops`. Owners are shown once, in the coverage line. */
export function shortRepo(full: string): string {
  return full.slice(full.indexOf('/') + 1);
}

/* ── deploy state: GET /api/projects ─────────────────────────────────────── */

export interface DeployProject {
  id: string;
  name: string;
  latestDeployment: {
    state: string;
    url: string | null;
    createdAt: number | null;
    target: string | null;
  } | null;
}

/**
 * Deploy state per Vercel project. Folded onto Standing so "where do things
 * stand" is one page rather than three: issues answer what the work is, this
 * answers whether what shipped is actually up.
 *
 * Same fail-loud contract as the fleet read — a 200 that is not the payload is
 * an error, never an empty list that reads as "no projects".
 */
export async function fetchDeploys(signal: AbortSignal): Promise<DeployProject[]> {
  const res = await fetch('/api/projects', { signal });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      isRecord(body) && typeof body['error'] === 'string'
        ? (body['error'] as string)
        : `HTTP ${res.status}`;
    throw new Error(message);
  }
  if (!isRecord(body) || !Array.isArray(body['projects'])) {
    throw new Error('GET /api/projects returned 200 with a body that is not the projects payload.');
  }
  return body['projects'] as DeployProject[];
}

/* ── acting on an issue, straight to GitHub ──────────────────────────────── */

/**
 * The baseline action set every issue row carries, whichever lane it is in.
 *
 * All mirror-free: they address the issue by `github:<owner>/<repo>#<n>` and
 * write labels straight to GitHub, because Standing lists repos the Supabase
 * importer has never touched and a mirror-backed action would fail on exactly
 * those.
 */
export type StandingAction =
  | 'queue_on'
  | 'queue_off'
  | 'ralph_requeue'
  | 'unblock'
  | 'bump_priority'
  | 'auto_on_direct'
  | 'auto_off_direct'
  | 'park_direct'
  | 'run_now';

/** `error` is present exactly when `ok` is false. */
export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * One-tap issue actions. The key is built from repo + number rather than looked
 * up, because these deliberately bypass the Supabase mirror — Standing lists
 * repos the importer has never touched, and a mirror-backed action would fail
 * on exactly those (lib/tasks/actions.mjs::labelIssueDirect).
 */
export async function actOnIssue(
  repo: string,
  number: number,
  action: StandingAction,
  priority?: string | null,
): Promise<ActionResult> {
  try {
    const res = await fetch('/api/task-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: `github:${repo}#${number}`,
        action,
        actor: 'standing',
        // Only sent when the action carries one — the route reads `priority`
        // as undefined-means-absent, and a stray null would clear the label.
        ...(priority === undefined ? {} : { priority }),
      }),
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        error:
          isRecord(body) && typeof body['error'] === 'string'
            ? (body['error'] as string)
            : `HTTP ${res.status}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
