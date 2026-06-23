/* hds-bypass: ops-internal section. Inline styles intentional for ops dashboard. */

/**
 * SessionsSection — /ops feed of routing decisions and dispatch lifecycle.
 *
 * Reads two sources at build time:
 *   - docs/ai/routing-log.jsonl (append-only audit trail from auto-assigner.mjs
 *     and cost-ceiling-gate.mjs)
 *   - clients/<slug>/tasks.json (joined per entry to enrich with current
 *     task title + cost state for the AgentTag meta slot)
 *
 * Surface choice rationale (research): production AI ops UIs (Devin, Cursor,
 * Factory, Replit, Linear) converged on session-feed + sidebar list, NOT
 * Kanban. Status is a side-rule via ActivityFeed's status color, not a
 * column. Filter chips + search narrow the list without changing layout.
 */

import { useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  Bot,
  AlertCircle,
  CheckCircle2,
  MessageSquare,
  HelpCircle,
  ShieldCheck,
} from 'lucide-react';
import hds from '@hirobius/design-system/tokens';
import { Stack } from '@hirobius/design-system';
import { ActivityFeed, type ActivityEvent, type ActivityStatus } from '@hirobius/design-system';
import { AgentTag, type AgentTier } from '../../components/agent-tag';
import { Icon } from '@hirobius/design-system';
import type { ClientFiles, ClientTask } from './clientTypes';
import { PodTail } from './PodTail';

/** SessionEvent extends ActivityEvent with internal filter keys. Exported so
 *  SessionsPage can build optimistic events client-side and pass them via
 *  the `liveEvents` prop. */
export type SessionEvent = ActivityEvent & {
  _client?: string;
  _tier?: AgentTier;
  _status: ActivityStatus;
  _taskId?: string;
};

// ── Inputs ─────────────────────────────────────────────────────────────────────

const _routingLog = import.meta.glob<string>('../../../../docs/ai/routing-log.jsonl', {
  eager: true,
  query: '?raw',
  import: 'default',
});

interface RoutingLogEntry {
  at: string;
  assigner?: string;
  gate?: string;
  client?: string;
  verdict?: 'task' | 'not-task' | 'ambiguous' | 'cleared' | 'rejected';
  taskId?: string;
  phaseId?: string;
  tier?: string;
  model?: string;
  effort?: string;
  privacy?: string;
  capability?: string;
  rationale?: string;
  reason?: string;
  inputDigest?: string;
  spent?: number;
  projected?: number;
  ceiling?: number;
  costCeiling?: number;
}

function parseLog(): RoutingLogEntry[] {
  const raw = Object.values(_routingLog)[0] ?? '';
  if (!raw) return [];
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as RoutingLogEntry;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is RoutingLogEntry => entry !== null);
}

// ── Task lookup ────────────────────────────────────────────────────────────────

function findTask(tasks: ClientFiles['tasks'], taskId: string): ClientTask | null {
  for (const phase of tasks?.phases ?? []) {
    for (const lane of phase.swimlanes ?? []) {
      const task = (lane.tasks ?? []).find((t) => t.id === taskId);
      if (task) return task;
    }
    const inline = (phase.tasks ?? []).find((t) => t.id === taskId);
    if (inline) return inline;
  }
  return null;
}

// ── Status + icon mapping ──────────────────────────────────────────────────────

function statusFor(entry: RoutingLogEntry, task: ClientTask | null): ActivityStatus {
  if (entry.verdict === 'rejected') return 'error';
  if (entry.verdict === 'not-task') return 'neutral';
  if (entry.verdict === 'ambiguous') return 'warning';
  switch (task?.dispatchState) {
    case 'failed':
      return 'error';
    case 'awaiting-review':
      return 'warning';
    case 'done':
      return 'success';
    case 'running':
      return 'info';
    default:
      return 'info';
  }
}

function iconFor(entry: RoutingLogEntry, task: ClientTask | null): ReactNode {
  if (entry.verdict === 'rejected') return <Icon icon={AlertCircle} size="medium" />;
  if (entry.verdict === 'not-task') return <Icon icon={MessageSquare} size="medium" />;
  if (entry.verdict === 'ambiguous') return <Icon icon={HelpCircle} size="medium" />;
  if (entry.verdict === 'cleared') return <Icon icon={ShieldCheck} size="medium" />;
  if (task?.dispatchState === 'done') return <Icon icon={CheckCircle2} size="medium" />;
  return <Icon icon={Bot} size="medium" />;
}

function tierFor(entry: RoutingLogEntry, task: ClientTask | null): AgentTier {
  const raw = entry.tier ?? deriveTierFromModel(task?.model ?? entry.model);
  if (raw === 'open-local' || raw === 'closed-frontier') return raw;
  return 'open-local';
}

function deriveTierFromModel(model: string | undefined): AgentTier {
  if (!model) return 'open-local';
  if (model.startsWith('gemma') || model.startsWith('hermes') || model.startsWith('qwen'))
    return 'open-local';
  if (model.startsWith('haiku') || model.startsWith('sonnet') || model.startsWith('opus'))
    return 'closed-frontier';
  return 'open-local';
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace('T', ' · ').slice(0, 16);
}

// ── Event composition ──────────────────────────────────────────────────────────

interface ComposeArgs {
  entries: RoutingLogEntry[];
  registry: Record<string, ClientFiles>;
}

function composeEvents({ entries, registry }: ComposeArgs): SessionEvent[] {
  return entries
    .slice()
    .reverse() // newest first
    .map((entry) => {
      const clientFiles = entry.client ? registry[entry.client] : undefined;
      const task =
        entry.taskId && clientFiles?.tasks ? findTask(clientFiles.tasks, entry.taskId) : null;
      const tier = tierFor(entry, task);
      const status = statusFor(entry, task);
      const meta =
        task && entry.verdict === 'task' && task.assignee ? (
          <AgentTag
            assignee={task.assignee}
            modelTier={tier}
            costSpent={task.costSpent ?? 0}
            costCeiling={task.costCeiling ?? 0}
          />
        ) : null;

      return {
        id: `${entry.at}-${entry.taskId ?? entry.verdict ?? 'evt'}`,
        title:
          task?.title ?? (entry.inputDigest ? entry.inputDigest.slice(0, 80) : verdictTitle(entry)),
        description: entry.rationale ?? entry.reason ?? entry.inputDigest ?? '—',
        timestamp: formatTimestamp(entry.at),
        category: entry.client ?? entry.gate ?? entry.assigner ?? '—',
        icon: iconFor(entry, task),
        status,
        meta,
        _client: entry.client,
        _tier: tier,
        _status: status,
        _taskId: entry.taskId,
      };
    });
}

function verdictTitle(entry: RoutingLogEntry): string {
  if (entry.verdict === 'not-task') return 'Not a task';
  if (entry.verdict === 'ambiguous') return 'Ambiguous input';
  if (entry.verdict === 'rejected') return 'Dispatch rejected by cost gate';
  if (entry.verdict === 'cleared') return 'Cost gate cleared';
  return entry.taskId ?? 'Routing event';
}

// ── Component ──────────────────────────────────────────────────────────────────

interface SessionsSectionProps {
  registry: Record<string, ClientFiles>;
  /** Compact mode for the /ops landing — hides filter UI + search, caps the
   *  feed at 5 events. The full surface lives at /ops/sessions. */
  compact?: boolean;
  /** Optional rendered above the feed (used by SessionsPage for the input
   *  form). Slot is feed-context-aware: respects mobile-first stacking. */
  inputPanel?: ReactNode;
  /** Optimistic events prepended ahead of the bundled routing-log entries.
   *  Deduped by taskId (or event id) so a HMR-refreshed bundle can't render
   *  duplicates. */
  liveEvents?: SessionEvent[];
}

const STATUS_FILTERS: Array<{ value: ActivityStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'info', label: 'Queued' },
  { value: 'warning', label: 'Review' },
  { value: 'success', label: 'Done' },
  { value: 'error', label: 'Failed' },
];

const TIER_FILTERS: Array<{ value: AgentTier | 'all'; label: string }> = [
  { value: 'all', label: 'All tiers' },
  { value: 'open-local', label: 'Open · local' },
  { value: 'closed-frontier', label: 'Closed · frontier' },
];

export function SessionsSection({
  registry,
  compact = false,
  inputPanel,
  liveEvents,
}: SessionsSectionProps) {
  const baseEvents = useMemo(() => composeEvents({ entries: parseLog(), registry }), [registry]);

  const allEvents = useMemo(() => {
    if (!liveEvents?.length) return baseEvents;
    const seen = new Set<string>();
    const merged: SessionEvent[] = [];
    for (const e of [...liveEvents, ...baseEvents]) {
      const key = e._taskId ?? e.id;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(e);
    }
    return merged;
  }, [baseEvents, liveEvents]);

  const clientOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of allEvents) if (e._client) set.add(e._client);
    return ['all', ...Array.from(set).sort()];
  }, [allEvents]);

  const [client, setClient] = useState<string>('all');
  const [status, setStatus] = useState<ActivityStatus | 'all'>('all');
  const [tier, setTier] = useState<AgentTier | 'all'>('all');
  const [search, setSearch] = useState<string>('');

  const filtered = useMemo(() => {
    if (compact) return allEvents.slice(0, 5);
    const q = search.trim().toLowerCase();
    return allEvents.filter((e) => {
      if (client !== 'all' && e._client !== client) return false;
      if (status !== 'all' && e._status !== status) return false;
      if (tier !== 'all' && e._tier !== tier) return false;
      if (q && !`${e.title} ${e.description}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allEvents, client, status, tier, search, compact]);

  // 13w-ops-13a: attach a polled stdout pod-tail under in-flight SessionEvents
  // when the full surface is showing (not compact). "In-flight" = non-terminal
  // status; the PodTail component itself stops polling once it observes a
  // terminal event in the stream.
  const withTails = useMemo<SessionEvent[]>(() => {
    if (compact) return filtered;
    return filtered.map((e) => {
      const isLive = e._status === 'info' || e._status === 'neutral';
      if (!isLive) return e;
      const podId = e._taskId ?? e.id;
      return {
        ...e,
        meta: (
          <Stack direction="column" gap="hairline">
            {e.meta}
            <PodTail podId={podId} isLive={isLive} />
          </Stack>
        ),
      };
    });
  }, [filtered, compact]);

  if (allEvents.length === 0) {
    return (
      <Stack direction="column" gap="gap">
        {inputPanel}
        <p
          style={{
            ...hds.typeStyles.body,
            color: 'var(--semantic-color-content-secondary)',
            margin: 0,
          }}
        >
          No routing events yet. Pipe a task through{' '}
          <code style={{ ...hds.typeStyles.mono }}>scripts/auto-assigner.mjs</code> or send a
          message via Discord, Telegram, or the input above.
        </p>
      </Stack>
    );
  }

  return (
    <Stack direction="column" gap="gap">
      {inputPanel}

      {/* Filter chip bands + search — hidden in compact mode (preview surface). */}
      {!compact && (
        <Stack direction="column" gap="gap">
          <ChipRow label="Client">
            {clientOptions.map((c) => (
              <Chip key={c} active={client === c} onClick={() => setClient(c)}>
                {c === 'all' ? 'All clients' : c}
              </Chip>
            ))}
          </ChipRow>
          <ChipRow label="Status">
            {STATUS_FILTERS.map((f) => (
              <Chip key={f.value} active={status === f.value} onClick={() => setStatus(f.value)}>
                {f.label}
              </Chip>
            ))}
          </ChipRow>
          <ChipRow label="Tier">
            {TIER_FILTERS.map((f) => (
              <Chip key={f.value} active={tier === f.value} onClick={() => setTier(f.value)}>
                {f.label}
              </Chip>
            ))}
          </ChipRow>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or rationale…"
            style={searchInputStyle}
          />
        </Stack>
      )}

      {/* Feed — in-flight events get an inline PodTail (pod-tail polled
          stdout), one event at a time, per 13w-ops-13a-live-pod-tail. */}
      {withTails.length === 0 ? (
        <p
          style={{
            ...hds.typeStyles.body,
            color: 'var(--semantic-color-content-secondary)',
            margin: 0,
          }}
        >
          No events match the current filters.
        </p>
      ) : (
        <ActivityFeed events={withTails} />
      )}
    </Stack>
  );
}

// ── Chip primitives (local — narrow filter affordance) ─────────────────────────

function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack direction="row" gap="gap" align="center" wrap="wrap">
      <span
        style={{
          ...hds.typeStyles.eyebrow,
          margin: 0,
          color: 'var(--semantic-color-content-secondary)',
          minWidth: '4ch',
        }}
      >
        {label}
      </span>
      {children}
    </Stack>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hds-focus"
      // inline-ok: border, background, and color are all conditional on active state
      style={{
        ...hds.typeStyles.ui,
        padding: '4px 10px',
        borderRadius: hds.borderRadius[8],
        border: active
          ? '1px solid var(--semantic-color-content-accent)'
          : '1px solid var(--semantic-color-border-subdued)',
        background: active ? 'var(--semantic-color-feedback-bg-info)' : 'transparent',
        color: active
          ? 'var(--semantic-color-feedback-info)'
          : 'var(--semantic-color-content-primary)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

const searchInputStyle: CSSProperties = {
  ...hds.typeStyles.body,
  padding: '8px 12px',
  borderRadius: hds.borderRadius[8],
  border: '1px solid var(--semantic-color-border-default)',
  background: 'transparent',
  color: 'var(--semantic-color-content-primary)',
  width: '100%',
  maxWidth: '480px',
};
