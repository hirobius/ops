/**
 * agentic-os/data.ts — pure parsing + aggregation for the /ops dashboard.
 *
 * Build-time imports of every JSONL log + orchestration.json + the
 * strength snapshot. Vite serves these as raw strings or parsed JSON, so
 * this module does no I/O of its own — it just normalises shapes and
 * computes the small derived values the dashboard renders. Hot-reload
 * picks up file edits because the imports declare them as dependencies.
 *
 * Source files (read once at build time):
 *   - docs/ai/orchestration.json              units + claims
 *   - docs/ai/swarm-watchdog-decisions.jsonl  watchdog dispatch trace
 *   - docs/security/agent-audit-log.jsonl     HITL audit trail
 *   - docs/ai/routing-log.jsonl               cost + verdict
 *   - docs/guardrails/firing-log.jsonl        gate firings
 *   - telemetry/events.jsonl                  retry events
 *   - docs/guardrails/strength-report.json    composite scores
 *   - docs/guardrails/strength-history.jsonl  sparkline points
 *   - docs/guardrails/registry.json           --json compliance
 */

// Legacy orchestration archive retired 2026-07-02 — units now live in Hermes Kanban.
// Empty stub keeps the derived dashboard values rendering (empty state) for the HDS
// cutover to redesign, and drops the ~1 MB archive JSON from the app bundle.
const orchestration = { units: [] };
import watchdogDecisionsRaw from '../../../../../docs/ai/swarm-watchdog-decisions.jsonl?raw';
import agentAuditRaw from '../../../../../docs/security/agent-audit-log.jsonl?raw';
// routing-log.jsonl holds per-client task PII and is gitignored; this glob tolerates
// its absence (yields '' in clean/prod builds) instead of a hard import failure.
const _routingLogGlob = import.meta.glob<string>('../../../../../docs/ai/routing-log.jsonl', {
  eager: true,
  query: '?raw',
  import: 'default',
});
const routingLogRaw = (Object.values(_routingLogGlob)[0] as string | undefined) ?? '';
import firingLogRaw from '../../../../../docs/guardrails/firing-log.jsonl?raw';
import telemetryEventsRaw from '../../../../../telemetry/events.jsonl?raw';
import strengthReport from '../../../../../docs/guardrails/strength-report.json';
import strengthHistoryRaw from '../../../../../docs/guardrails/strength-history.jsonl?raw';
import registry from '../../../../../docs/guardrails/registry.json';

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

export interface WatchdogDecision {
  ts: string;
  candidateUnitId?: string;
  decision: string;
  reason?: string;
  factors?: Record<string, unknown>;
}

export interface AgentAuditEntry {
  timestamp: string;
  unit_id?: string;
  agent_id?: string;
  outcome?: string;
  files_written?: string[];
  commit_hash?: string | null;
}

export interface RoutingEntry {
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

export interface FiringEntry {
  ts: string;
  channel?: string | null;
  gate?: string;
  exitCode?: number;
  durationMs?: number;
  commitSha?: string;
}

export interface RetryEvent {
  ts: string;
  event: string;
  data?: Record<string, unknown>;
}

export interface ProposedUnit {
  ts: string;
  fromUnitId: string;
  reason: 'blocker' | 'cleanup' | 'side-quest' | string;
  urgency: 'next' | 'eventually' | string;
  proposedUnit: {
    id: string;
    name: string;
    description?: string;
    dependsOn?: string[];
    tier?: string;
    effort?: string;
    safeForUnattended?: boolean;
  };
}

export interface StrengthHistoryPoint {
  date: string;
  scoreA: { composite: number };
  scoreB: { composite: number };
}

export type TraceSource = 'agent' | 'gate' | 'watchdog' | 'audit' | 'retry';

export interface TraceEvent {
  ts: string;
  source: TraceSource;
  kind: 'info' | 'success' | 'warning' | 'error';
  unitId?: string;
  message: string;
  costUsd?: number;
  durationMs?: number;
  exitCode?: number;
  raw: unknown;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Stale threshold for claims. Watchdog uses 4h; we mirror it. */
export const STALE_CLAIM_HOURS = 4;

/** Trace-table window. */
export const TRACE_LIMIT = 50;

// ── Generic helpers ──────────────────────────────────────────────────────────

export function parseJsonl<T>(raw: string): T[] {
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

function hoursSince(iso: string | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / 36e5;
}

// ── Source: orchestration ────────────────────────────────────────────────────

export const UNITS: Unit[] = (orchestration as { units: Unit[] }).units;

export interface StaleClaim extends Unit {
  ageHours: number;
}

export function computeStaleClaims(
  units: Unit[] = UNITS,
  thresholdHours = STALE_CLAIM_HOURS,
): StaleClaim[] {
  return units
    .filter((u) => u.status === 'claimed')
    .map((u) => ({ ...u, ageHours: hoursSince(u.claimedAt) }))
    .filter((u) => u.ageHours > thresholdHours)
    .sort((a, b) => b.ageHours - a.ageHours);
}

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
      u.pillar === 'BUILD' || u.pillar === 'GROW' || u.pillar === 'RUN'
        ? u.pillar
        : 'UNCLASSIFIED';
    const b = buckets.get(key)!;
    b.total += 1;
    b.unitIds.push(u.id);
    if (u.status === 'done') b.done += 1;
    if (u.status !== 'done' && u.status !== 'denied') b.open += 1;
  }
  return order.map((k) => buckets.get(k)!);
}

// ── Source: watchdog decisions ───────────────────────────────────────────────

export const WATCHDOG_DECISIONS = parseJsonl<WatchdogDecision>(watchdogDecisionsRaw);

export function recentReverts(
  decisions: WatchdogDecision[] = WATCHDOG_DECISIONS,
  withinHours = 24,
): WatchdogDecision[] {
  const cutoff = Date.now() - withinHours * 36e5;
  return decisions.filter((d) => d.decision === 'reverted' && new Date(d.ts).getTime() >= cutoff);
}

// ── Source: routing log (cost burn) ──────────────────────────────────────────

export const ROUTING_ENTRIES = parseJsonl<RoutingEntry>(routingLogRaw);

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

// ── Source: firing log ───────────────────────────────────────────────────────

export const FIRING_ENTRIES = parseJsonl<FiringEntry>(firingLogRaw);

export function gateFiresLastCommit(entries: FiringEntry[] = FIRING_ENTRIES): {
  commitSha: string | null;
  failures: number;
} {
  if (entries.length === 0) return { commitSha: null, failures: 0 };
  // Walk newest → oldest, find first entry with a commitSha, then count failures for that sha.
  const sorted = [...entries].sort((a, b) => (b.ts ?? '').localeCompare(a.ts ?? ''));
  const latest = sorted.find((e) => e.commitSha);
  if (!latest?.commitSha) return { commitSha: null, failures: 0 };
  const failures = sorted.filter(
    (e) => e.commitSha === latest.commitSha && (e.exitCode ?? 0) !== 0,
  ).length;
  return { commitSha: latest.commitSha, failures };
}

// ── Source: agent audit + telemetry retries ─────────────────────────────────

export const AGENT_AUDIT_ENTRIES = parseJsonl<AgentAuditEntry>(agentAuditRaw);
export const RETRY_EVENTS = parseJsonl<RetryEvent>(telemetryEventsRaw);

// ── Source: proposed-units (gitignored inbox seam — defensive load) ──────────

const proposedUnitsRaw =
  (Object.values(
    import.meta.glob('/docs/ai/proposed-units.jsonl', {
      eager: true,
      query: '?raw',
      import: 'default',
    }),
  )[0] as string | undefined) ?? '';

export const PROPOSED_UNITS = parseJsonl<ProposedUnit>(proposedUnitsRaw);

/** Newest-first, deduped by proposedUnit.id (latest wins). */
export function dedupedProposals(entries: ProposedUnit[] = PROPOSED_UNITS): ProposedUnit[] {
  const seen = new Set<string>();
  const out: ProposedUnit[] = [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    const id = e?.proposedUnit?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(e);
  }
  return out;
}

// ── Triage status (banner) ───────────────────────────────────────────────────

export type Triage = 'healthy' | 'stale' | 'errors';

export interface TriageState {
  status: Triage;
  staleCount: number;
  recentRevertCount: number;
  activeCount: number;
  todayCostUsd: number;
  message: string;
}

export function computeTriage(): TriageState {
  const stale = computeStaleClaims();
  const reverts = recentReverts();
  const active = activeClaims();
  const cost = computeTodayCost();

  let status: Triage = 'healthy';
  let message = `Healthy · ${active.length} active · $${cost.toFixed(2)} today`;

  if (reverts.length > 0) {
    status = 'errors';
    message = `Watchdog reverted ${reverts.length} unit${reverts.length === 1 ? '' : 's'} in the last 24h`;
  } else if (stale.length > 0) {
    status = 'stale';
    message = `${stale.length} stale claim${stale.length === 1 ? '' : 's'} — review or revert`;
  }

  return {
    status,
    staleCount: stale.length,
    recentRevertCount: reverts.length,
    activeCount: active.length,
    todayCostUsd: cost,
    message,
  };
}

// ── Strength + compliance (footer) ───────────────────────────────────────────

interface StrengthScore {
  composite: number | null;
  description?: string;
  wiredCoverage?: string;
}

export interface StrengthSnapshot {
  generated: string;
  scoreA: StrengthScore;
  scoreB: StrengthScore;
  sparkA: number[];
  sparkB: number[];
  jsonStrict: { compliant: number; total: number };
}

interface RegistryGate {
  id: string;
  firingChannel: string;
  supportsJson?: boolean;
  severity?: string;
}

export function loadStrength(): StrengthSnapshot {
  const report = strengthReport as {
    generated: string;
    scoreA: StrengthScore;
    scoreB: StrengthScore;
  };
  const history = parseJsonl<StrengthHistoryPoint>(strengthHistoryRaw)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);
  const sparkA = history.map((h) => h.scoreA.composite);
  const sparkB = history.map((h) => h.scoreB.composite);

  const gates = (registry as { gates: RegistryGate[] }).gates;
  const strict = gates.filter((g) => g.firingChannel !== 'pnpm-meta');
  const compliant = strict.filter((g) => g.supportsJson === true).length;

  return {
    generated: report.generated,
    scoreA: report.scoreA,
    scoreB: report.scoreB,
    sparkA,
    sparkB,
    jsonStrict: { compliant, total: strict.length },
  };
}

// ── Trace stream (5 sources unified) ─────────────────────────────────────────

function pushAgentAudit(entry: AgentAuditEntry, into: TraceEvent[]) {
  if (!entry.timestamp) return;
  into.push({
    ts: entry.timestamp,
    source: 'audit',
    kind: entry.outcome === 'failure' ? 'error' : 'info',
    unitId: entry.unit_id,
    message: `${entry.agent_id ?? 'agent'} · ${entry.outcome ?? '—'}${entry.commit_hash ? ' · ' + entry.commit_hash.slice(0, 7) : ''}`,
    raw: entry,
  });
}

function pushRouting(entry: RoutingEntry, into: TraceEvent[]) {
  if (!entry.at) return;
  const isGate = !!entry.gate;
  const failed = entry.verdict === 'rejected';
  into.push({
    ts: entry.at,
    source: isGate ? 'gate' : 'agent',
    kind: failed ? 'error' : isGate ? 'info' : 'success',
    unitId: entry.taskId,
    message: isGate
      ? `${entry.gate} · ${entry.verdict ?? '—'}${entry.client ? ' · ' + entry.client : ''}`
      : `${entry.assigner ?? 'router'} → ${entry.tier ?? '—'}/${entry.model ?? '—'}${entry.client ? ' · ' + entry.client : ''}`,
    costUsd: entry.projectedUsd,
    raw: entry,
  });
}

function pushWatchdog(entry: WatchdogDecision, into: TraceEvent[]) {
  if (!entry.ts) return;
  const reverted = entry.decision === 'reverted';
  into.push({
    ts: entry.ts,
    source: 'watchdog',
    kind: reverted ? 'error' : 'info',
    unitId: entry.candidateUnitId,
    message: `${entry.decision}${entry.reason ? ' · ' + entry.reason : ''}`,
    raw: entry,
  });
}

function pushFiring(entry: FiringEntry, into: TraceEvent[]) {
  if (!entry.ts) return;
  const failed = (entry.exitCode ?? 0) !== 0;
  into.push({
    ts: entry.ts,
    source: 'gate',
    kind: failed ? 'error' : 'success',
    message: `${entry.gate ?? 'gate'} · exit ${entry.exitCode ?? 0}${entry.channel ? ' · ' + entry.channel : ''}`,
    durationMs: entry.durationMs,
    exitCode: entry.exitCode,
    raw: entry,
  });
}

function pushRetry(entry: RetryEvent, into: TraceEvent[]) {
  if (!entry.ts) return;
  into.push({
    ts: entry.ts,
    source: 'retry',
    kind: entry.event.includes('error') ? 'error' : 'info',
    message: entry.event,
    raw: entry,
  });
}

export function unionTraceEvents(limit = TRACE_LIMIT): TraceEvent[] {
  const events: TraceEvent[] = [];
  for (const e of AGENT_AUDIT_ENTRIES) pushAgentAudit(e, events);
  for (const e of ROUTING_ENTRIES) pushRouting(e, events);
  for (const e of WATCHDOG_DECISIONS) pushWatchdog(e, events);
  for (const e of FIRING_ENTRIES) pushFiring(e, events);
  for (const e of RETRY_EVENTS) pushRetry(e, events);
  events.sort((a, b) => b.ts.localeCompare(a.ts));
  return events.slice(0, limit);
}

// ── Format helpers ───────────────────────────────────────────────────────────

export function fmtAge(hoursValue: number): string {
  if (!Number.isFinite(hoursValue)) return '∞';
  if (hoursValue < 1) return `${Math.round(hoursValue * 60)}m`;
  if (hoursValue < 24) return `${hoursValue.toFixed(1)}h`;
  return `${(hoursValue / 24).toFixed(1)}d`;
}

export function fmtUsd(amount: number): string {
  if (amount === 0) return '$0.00';
  if (amount < 0.001) return '<$0.001';
  return `$${amount.toFixed(amount < 1 ? 4 : 2).replace(/\.?0+$/, '')}`;
}

export function fmtRelativeTime(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const deltaSec = (now.getTime() - t) / 1000;
  if (deltaSec < 60) return `${Math.max(1, Math.round(deltaSec))}s ago`;
  if (deltaSec < 3600) return `${Math.round(deltaSec / 60)}m ago`;
  if (deltaSec < 86_400) return `${Math.round(deltaSec / 3600)}h ago`;
  if (deltaSec < 604_800) return `${Math.round(deltaSec / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}
