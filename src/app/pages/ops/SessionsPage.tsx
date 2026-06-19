/* hds-bypass: ops-internal page. Inline styles intentional for ops dashboard. */

/**
 * SessionsPage — full-page agent ops feed at /ops/sessions.
 *
 * Mobile-first. Renders SessionInputForm at the top and the full
 * SessionsSection feed below. On a successful task verdict, builds a
 * SessionEvent client-side from the API response and prepends it to the
 * feed via SessionsSection's `liveEvents` prop. Dedup-by-taskId in
 * SessionsSection prevents duplicates when a HMR refresh later picks up
 * the same routing-log line.
 */

import { useState } from 'react';
import { Bot } from 'lucide-react';
import { Page, Stack, Icon } from '@hirobius/design-system';
import { AgentTag } from '../../components/agent-tag';
import { PageHeader } from './PageHeader';
import { CLIENT_REGISTRY, CLIENT_SLUGS } from './clientRegistry';
import { SessionsSection, type SessionEvent } from './SessionsSection';
import { SessionInputForm, type AssignerResult } from './SessionInputForm';

const DEFAULT_CLIENT = CLIENT_SLUGS.includes('lilac-insure')
  ? 'lilac-insure'
  : (CLIENT_SLUGS[0] ?? 'lilac-insure');

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace('T', ' · ').slice(0, 16);
}

function buildLiveEvent(result: AssignerResult): SessionEvent | null {
  if (result.verdict !== 'task' || !result.taskId || !result.tier) return null;
  return {
    id: `${result.routedAt ?? Date.now()}-${result.taskId}`,
    title: result.title ?? result.taskId,
    description: result.rationale ?? '—',
    timestamp: formatTimestamp(result.routedAt ?? new Date().toISOString()),
    category: result.client ?? '—',
    icon: <Icon icon={Bot} size="medium" />,
    status: 'info',
    meta: (
      <AgentTag
        assignee={result.model ?? '—'}
        modelTier={result.tier}
        costSpent={0}
        costCeiling={result.costCeiling ?? 0}
      />
    ),
    _client: result.client,
    _tier: result.tier,
    _status: 'info',
    _taskId: result.taskId,
  };
}

export default function SessionsPage() {
  const [liveEvents, setLive] = useState<SessionEvent[]>([]);

  function handleResult(result: AssignerResult) {
    const event = buildLiveEvent(result);
    if (event) setLive((prev) => [event, ...prev]);
  }

  const inputPanel = (
    <SessionInputForm
      clients={CLIENT_SLUGS}
      defaultClient={DEFAULT_CLIENT}
      onResult={handleResult}
    />
  );

  return (
    <Page>
      <Stack direction="column" gap="spacious">
        <PageHeader
          breadcrumbs={[{ label: 'Ops', href: '/ops' }, { label: 'Sessions' }]}
          title="Sessions"
          lede="Routing decisions and dispatch lifecycle. Send a message to dispatch a new task; chitchat falls through as a memory note."
        />
        <SessionsSection
          registry={CLIENT_REGISTRY}
          inputPanel={inputPanel}
          liveEvents={liveEvents}
        />
      </Stack>
    </Page>
  );
}
