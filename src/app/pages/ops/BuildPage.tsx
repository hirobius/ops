/* hds-bypass: ops-internal page; not user-facing canon. */
/* eslint-disable no-restricted-syntax -- ops-internal; raw grid/flex layouts intentional for dense data tables */

/**
 * BuildPage — `/ops/build` — autonomous-build dashboard.
 *
 * Five sections per 13w-ops-12-build-page spec:
 *   1. Pipeline stats (orchestration unit counts, lifted from prior /ops)
 *   2. CostBurnWidget — routing-log cost rollups by client/tier/window
 *   3. Telemetry retry events — read telemetry/events.jsonl at runtime,
 *      filter to retry.* events, render as activity feed (last 20)
 *   4. Agent audit timeline — last 50 entries from
 *      docs/security/agent-audit-log.jsonl, grouped by unit_id
 *   5. Guardrails health heatmap — rules from docs/guardrails/registry.json,
 *      flagged when missing fixture or stale firingChannel
 *
 * @category Internal
 * @tier utility
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Activity as ActivityIcon, AlertCircle, CheckCircle2, RotateCw } from 'lucide-react';

import hds from '@hirobius/design-system/tokens';
import { Stack, Page, Surface, Card, Badge, Icon } from '@hirobius/design-system';
import { ActivityFeed, type ActivityEvent } from '@hirobius/design-system';
import { useIsMobile } from '../../hooks/useIsMobile';

import legacyTaskArchive from '../../../../docs/ai/_archive/legacy-task-systems-2026-05-11.json';
const orchestration = legacyTaskArchive.sources.orchestration;
import auditLogRaw from '../../../../docs/security/agent-audit-log.jsonl?raw';
import registryRaw from '../../../../docs/guardrails/registry.json';
import { PageHeader } from './PageHeader';
import CostBurnWidget from './CostBurnWidget';
import { parseJsonlLines } from '../../lib/jsonl';

// ── Pipeline stats ────────────────────────────────────────────────────────────

type OUnit = { id: string; status: string; claimedBy?: string; hitl?: boolean };
const units = (orchestration as { units: OUnit[] }).units;
const statDone = units.filter((u) => u.status === 'done').length;
const statQueued = units.filter((u) => u.status === 'approved' && !u.hitl).length;
const statHitl = units.filter((u) => u.hitl === true).length;
const statClaimed = units.filter((u) => u.status === 'claimed').length;
const total = units.length;
const pct = Math.round((statDone / total) * 100);

const STATS = [
  { v: statDone, l: 'Done' },
  { v: statQueued, l: 'Queued' },
  { v: statClaimed, l: 'In-flight' },
  { v: statHitl, l: 'HITL' },
  { v: total, l: 'Total' },
  { v: `${pct}%`, l: 'Complete' },
];

// ── Audit timeline ────────────────────────────────────────────────────────────

interface AuditEntry {
  timestamp: string;
  unit_id: string;
  agent_id: string;
  files_written: string[];
  commit_hash: string | null;
  outcome: string;
}

function parseAuditLog(raw: string): AuditEntry[] {
  return parseJsonlLines<AuditEntry>(raw);
}

function auditEntryToActivity(e: AuditEntry, idx: number): ActivityEvent {
  const filesCount = e.files_written?.length ?? 0;
  const status =
    e.outcome === 'committed'
      ? 'success'
      : e.outcome === 'aborted'
        ? 'warning'
        : e.outcome === 'error'
          ? 'error'
          : 'neutral';
  const icon =
    e.outcome === 'committed' ? (
      <Icon icon={CheckCircle2} size="small" />
    ) : e.outcome === 'aborted' ? (
      <Icon icon={AlertCircle} size="small" />
    ) : (
      <Icon icon={ActivityIcon} size="small" />
    );
  return {
    id: `audit-${idx}-${e.timestamp}`,
    title: e.unit_id,
    description: `${e.agent_id} • ${e.outcome}${filesCount ? ` • ${filesCount} file${filesCount === 1 ? '' : 's'}` : ''}${e.commit_hash ? ` • ${e.commit_hash.slice(0, 8)}` : ''}`,
    timestamp: e.timestamp,
    category: 'Agent audit',
    icon,
    status,
  };
}

// ── Retry events (runtime fetch) ──────────────────────────────────────────────

interface RetryEvent {
  ts: string;
  event: string;
  data?: Record<string, unknown>;
}

function retryEventToActivity(e: RetryEvent, idx: number): ActivityEvent {
  const status =
    e.event.includes('error') || e.event.includes('fail')
      ? 'error'
      : e.event.includes('start')
        ? 'info'
        : e.event.includes('success') || e.event.includes('done')
          ? 'success'
          : 'neutral';
  return {
    id: `retry-${idx}-${e.ts}`,
    title: e.event,
    description: e.data ? JSON.stringify(e.data).slice(0, 120) : '—',
    timestamp: e.ts,
    category: 'Telemetry',
    icon: <Icon icon={RotateCw} size="small" />,
    status,
  };
}

// ── Guardrails heatmap ────────────────────────────────────────────────────────

interface GuardrailEntry {
  id: string;
  script?: string;
  firingChannel?: string;
  fixture?: string;
  proofOfFiring?: string;
  description?: string;
}

interface GuardrailRegistry {
  version?: string;
  gates?: GuardrailEntry[];
  validators?: GuardrailEntry[];
}

const registry = registryRaw as GuardrailRegistry;
const allRules: GuardrailEntry[] = [...(registry.gates || []), ...(registry.validators || [])];

interface HealthRow {
  id: string;
  hasFixture: boolean;
  hasFiringChannel: boolean;
  channel: string;
  ok: boolean;
}

const healthRows: HealthRow[] = allRules.map((r) => ({
  id: r.id,
  hasFixture: Boolean(r.fixture || r.proofOfFiring),
  hasFiringChannel: Boolean(r.firingChannel),
  channel: r.firingChannel ?? '—',
  ok: Boolean((r.fixture || r.proofOfFiring) && r.firingChannel),
}));

const healthSummary = {
  total: healthRows.length,
  ok: healthRows.filter((r) => r.ok).length,
  missingFixture: healthRows.filter((r) => !r.hasFixture).length,
  missingChannel: healthRows.filter((r) => !r.hasFiringChannel).length,
};

// ── Sub-components ────────────────────────────────────────────────────────────

function BandLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        ...hds.typeStyles.eyebrow,
        margin: 0,
        color: 'var(--semantic-color-content-secondary)',
      }}
    >
      {children}
    </p>
  );
}

function StatTile({ value, label }: { value: string | number; label: string }) {
  return (
    <Surface padding="item" style={{ minWidth: 120 }}>
      <Stack direction="column" gap="hairline">
        <p
          style={{
            ...hds.typeStyles.heading2,
            margin: 0,
            color: 'var(--semantic-color-content-primary)',
          }}
        >
          {value}
        </p>
        <p
          style={{
            ...hds.typeStyles.ui,
            margin: 0,
            color: 'var(--semantic-color-content-secondary)',
          }}
        >
          {label}
        </p>
      </Stack>
    </Surface>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BuildPage() {
  const isMobile = useIsMobile();
  const [retryEvents, setRetryEvents] = useState<RetryEvent[]>([]);
  const [retryFetchState, setRetryFetchState] = useState<'idle' | 'loaded' | 'unavailable'>('idle');

  useEffect(() => {
    let cancelled = false;
    fetch('/telemetry/events.jsonl')
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('not-found'))))
      .then((text) => {
        if (cancelled) return;
        const events = parseJsonlLines<RetryEvent>(text);
        const recent = events
          .filter((e) => e.event?.startsWith('retry.'))
          .slice(-20)
          .reverse();
        setRetryEvents(recent);
        setRetryFetchState('loaded');
      })
      .catch(() => {
        if (!cancelled) setRetryFetchState('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const auditEvents: ActivityEvent[] = useMemo(() => {
    const entries = parseAuditLog(auditLogRaw);
    const recent = entries.slice(-50).reverse();
    return recent.map(auditEntryToActivity);
  }, []);

  const retryActivity: ActivityEvent[] = useMemo(
    () => retryEvents.map(retryEventToActivity),
    [retryEvents],
  );

  return (
    <Page>
      <Stack direction="column" gap="spacious">
        <PageHeader
          breadcrumbs={[{ label: 'Ops', href: '/ops' }, { label: 'Build' }]}
          title="Build"
          lede="Autonomous-build dashboard. Pipeline state, cost burn, retry telemetry, agent audit timeline, guardrails health."
        />

        {/* Section 1: Pipeline stats */}
        <Stack direction="column" gap="gap">
          <BandLabel>Pipeline state</BandLabel>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(6, minmax(120px, 1fr))',
              gap: hds.semantic.space.component.gap,
            }}
          >
            {STATS.map((s) => (
              <StatTile key={s.l} value={s.v} label={s.l} />
            ))}
          </div>
        </Stack>

        {/* Section 2: CostBurnWidget */}
        <Stack direction="column" gap="gap">
          <BandLabel>Cost burn</BandLabel>
          <CostBurnWidget />
        </Stack>

        {/* Section 3: Retry telemetry */}
        <Stack direction="column" gap="gap">
          <BandLabel>Retry telemetry — last 20</BandLabel>
          {retryFetchState === 'idle' && (
            <p
              style={{
                ...hds.typeStyles.ui,
                margin: 0,
                color: 'var(--semantic-color-content-secondary)',
              }}
            >
              Loading…
            </p>
          )}
          {retryFetchState === 'unavailable' && (
            <p
              style={{
                ...hds.typeStyles.ui,
                margin: 0,
                color: 'var(--semantic-color-content-secondary)',
              }}
            >
              telemetry/events.jsonl not served by this build (gitignored runtime artifact).
            </p>
          )}
          {retryFetchState === 'loaded' && retryActivity.length === 0 && (
            <p
              style={{
                ...hds.typeStyles.ui,
                margin: 0,
                color: 'var(--semantic-color-content-secondary)',
              }}
            >
              No retry events captured yet.
            </p>
          )}
          {retryFetchState === 'loaded' && retryActivity.length > 0 && (
            <ActivityFeed events={retryActivity} />
          )}
        </Stack>

        {/* Section 4: Agent audit timeline */}
        <Stack direction="column" gap="gap">
          <BandLabel>Agent audit timeline — last {auditEvents.length}</BandLabel>
          {auditEvents.length === 0 ? (
            <p
              style={{
                ...hds.typeStyles.ui,
                margin: 0,
                color: 'var(--semantic-color-content-secondary)',
              }}
            >
              No audit entries.
            </p>
          ) : (
            <ActivityFeed events={auditEvents} />
          )}
        </Stack>

        {/* Section 5: Guardrails heatmap */}
        <Stack direction="column" gap="gap">
          <BandLabel>
            Guardrails health — {healthSummary.ok}/{healthSummary.total} fully wired
          </BandLabel>
          <Card tone="default" padding="component">
            <Stack direction="column" gap="gap">
              <div
                style={{ display: 'flex', flexWrap: 'wrap', gap: hds.semantic.space.component.gap }}
              >
                <Badge tone={healthSummary.missingFixture ? 'warning' : 'success'}>
                  {healthSummary.missingFixture} missing fixture
                </Badge>
                <Badge tone={healthSummary.missingChannel ? 'warning' : 'success'}>
                  {healthSummary.missingChannel} missing channel
                </Badge>
                <Badge tone="neutral">{healthSummary.total} total rules</Badge>
              </div>
              {healthRows.filter((r) => !r.ok).length > 0 && (
                <Stack direction="column" gap="hairline">
                  <p
                    style={{
                      ...hds.typeStyles.eyebrow,
                      margin: 0,
                      color: 'var(--semantic-color-content-tertiary)',
                    }}
                  >
                    Rules with gaps
                  </p>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) auto auto',
                      gap: hds.space.px8,
                      alignItems: 'baseline',
                    }}
                  >
                    {healthRows
                      .filter((r) => !r.ok)
                      .slice(0, 12)
                      .map((r) => (
                        <React.Fragment key={r.id}>
                          <code
                            style={{
                              ...hds.typeStyles.technical,
                              color: 'var(--semantic-color-content-primary)',
                            }}
                          >
                            {r.id}
                          </code>
                          <Badge tone={r.hasFixture ? 'success' : 'warning'}>
                            fixture {r.hasFixture ? '✓' : '✗'}
                          </Badge>
                          <Badge tone={r.hasFiringChannel ? 'success' : 'warning'}>
                            {r.channel}
                          </Badge>
                        </React.Fragment>
                      ))}
                  </div>
                  {healthRows.filter((r) => !r.ok).length > 12 && (
                    <p
                      style={{
                        ...hds.typeStyles.ui,
                        margin: 0,
                        color: 'var(--semantic-color-content-tertiary)',
                      }}
                    >
                      … and {healthRows.filter((r) => !r.ok).length - 12} more
                    </p>
                  )}
                </Stack>
              )}
            </Stack>
          </Card>
        </Stack>
      </Stack>
    </Page>
  );
}
