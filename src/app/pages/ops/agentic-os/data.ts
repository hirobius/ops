/**
 * agentic-os/data.ts — pure parsing + aggregation for the /ops dashboard.
 *
 * Build-time imports of every JSONL log + orchestration.json. Vite serves
 * these as raw strings or parsed JSON, so this module does no I/O of its
 * own — it just normalises shapes and computes the small derived values
 * the dashboard renders. Hot-reload picks up file edits because the
 * imports declare them as dependencies.
 *
 * Source files (read once at build time):
 *   - docs/ai/routing-log.jsonl  cost + verdict (gitignored, PII)
 *
 * The retired orchestration/watchdog/agent-audit/firing/telemetry feeds were
 * dropped 2026-07-03 (#17) — their widgets (triage banner, errors/stale KPI,
 * trace stream) were orchestration-era dead weight.
 *
 * Second pass (#17): dropped the remaining orphans left behind by that
 * retirement — the stale-claim watchdog mirror (computeStaleClaims,
 * STALE_CLAIM_HOURS), the never-rendered proposed-units inbox
 * (PROPOSED_UNITS, dedupedProposals), and loadStrength/StrengthSnapshot,
 * a dead duplicate of the guardrail-strength read that
 * `atlas/strength-tab.tsx` already does itself directly. None of these
 * had a live caller.
 */

// Legacy orchestration archive retired 2026-07-02 — units now live in Hermes Kanban.
// Empty stub keeps the derived dashboard values rendering (empty state) for the HDS
// cutover to redesign, and drops the ~1 MB archive JSON from the app bundle.
const orchestration = { units: [] };
// routing-log.jsonl holds per-client task PII and is gitignored; this glob tolerates
// its absence (yields '' in clean/prod builds) instead of a hard import failure.
const _routingLogGlob = import.meta.glob<string>('../../../../../docs/ai/routing-log.jsonl', {
  eager: true,
  query: '?raw',
  import: 'default',
});
const routingLogRaw = (Object.values(_routingLogGlob)[0] as string | undefined) ?? '';

// ── Types ────────────────────────────────────────────────────────────────────

export type UnitStatus =
  | 'approved'
  | 'claimed'
  | 'done'
  | 'denied'
  | 'parked'
  | 'needs-grilling'
  | string;

/**
 * Pillar — orthogonal "business realm" classification.
 *
 *   BUILD  product/DS/site work — the artifact Adrian ships
 *   GROW   sales/marketing/content/client-acquisition
 *   RUN    ops/infra/hygiene/automation — what keeps it working
 *
 * Pillar is independent of `cluster` (technical grouping) and `phase`
 * (build sequence). A unit always has at most one pillar; new units are
 * auto-classified at write-time by `scripts/classify-pillars.mjs` and
 * existing ones backfilled in batches.
 */
export type Pillar = 'BUILD' | 'GROW' | 'RUN';

export interface Unit {
  id: string;
  status: UnitStatus;
  name?: string;
  cluster?: string;
  phase?: string;
  priority?: number;
  tier?: string;
  approval?: string;
  pillar?: Pillar;
  claimedBy?: string;
  claimedAt?: string;
  completedAt?: string;
  dependsOn?: string[];
  hitl?: boolean;
}

/** Local — only consumed inside this module (see ROUTING_ENTRIES below). */
interface RoutingEntry {
  at?: string;
  assigner?: string;
  gate?: string;
  verdict?: string;
  client?: string;
  taskId?: string;
  tier?: string;
  model?: string;
  projectedUsd?: number;
  costCeiling?: number;
}

// ── Generic helpers ──────────────────────────────────────────────────────────

/** Local — only consumed inside this module (see ROUTING_ENTRIES below). */
function parseJsonl<T>(raw: string): T[] {
  if (!raw) return [];
  const out: T[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as T);
    } catch {
      /* ignore malformed line */
    }
  }
  return out;
}

// ── Source: orchestration ────────────────────────────────────────────────────

export const UNITS: Unit[] = (orchestration as { units: Unit[] }).units;

export function activeClaims(units: Unit[] = UNITS): Unit[] {
  return units.filter((u) => u.status === 'claimed');
}

// ── Pillar distribution ──────────────────────────────────────────────────────

export interface PillarBucket {
  pillar: Pillar | 'UNCLASSIFIED';
  total: number;
  open: number; // not done & not denied
  done: number;
  unitIds: string[];
}

/**
 * Group units by pillar (BUILD/GROW/RUN), with a bucket for unclassified
 * units. Counts are computed lazily so the rail renders the same numbers
 * shown in the dashboard.
 */
export function computePillarBuckets(units: Unit[] = UNITS): PillarBucket[] {
  const order: Array<Pillar | 'UNCLASSIFIED'> = ['BUILD', 'GROW', 'RUN', 'UNCLASSIFIED'];
  const buckets = new Map<Pillar | 'UNCLASSIFIED', PillarBucket>();
  for (const key of order) {
    buckets.set(key, { pillar: key, total: 0, open: 0, done: 0, unitIds: [] });
  }
  for (const u of units) {
    const key: Pillar | 'UNCLASSIFIED' =
      u.pillar === 'BUILD' || u.pillar === 'GROW' || u.pillar === 'RUN' ? u.pillar : 'UNCLASSIFIED';
    const b = buckets.get(key)!;
    b.total += 1;
    b.unitIds.push(u.id);
    if (u.status === 'done') b.done += 1;
    if (u.status !== 'done' && u.status !== 'denied') b.open += 1;
  }
  return order.map((k) => buckets.get(k)!);
}

// ── Source: routing log (cost burn) ──────────────────────────────────────────

const ROUTING_ENTRIES = parseJsonl<RoutingEntry>(routingLogRaw);

function startOfTodayUtcMs(now: Date = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export function computeTodayCost(
  entries: RoutingEntry[] = ROUTING_ENTRIES,
  now: Date = new Date(),
): number {
  const since = startOfTodayUtcMs(now);
  return entries
    .filter((r) => !r.gate && r.at && new Date(r.at).getTime() >= since)
    .reduce((sum, r) => sum + (r.projectedUsd ?? 0), 0);
}

// ── Format helpers ───────────────────────────────────────────────────────────

export function fmtUsd(amount: number): string {
  if (amount === 0) return '$0.00';
  if (amount < 0.001) return '<$0.001';
  return `$${amount.toFixed(amount < 1 ? 4 : 2).replace(/\.?0+$/, '')}`;
}
