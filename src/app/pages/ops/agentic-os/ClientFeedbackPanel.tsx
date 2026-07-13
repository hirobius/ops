/* hds-bypass: ops-internal page */

/**
 * ClientFeedbackPanel — the client change-request inbox on `/ops`.
 *
 * Renders rows from the `client_feedback` store (migration 0012): everything a
 * client typed into the portal's "Send feedback" card (/c/:slug). Live data
 * (not a committed JSONL like FleetTimeline) — polls GET
 * /api/portal-verify?feedback=1 via the shared usePoll lifecycle, same idiom
 * as the tasks/leads boards. Empty store and offline API both render one
 * quiet line so the panel never breaks the page.
 */

import type { CSSProperties } from 'react';
import { Badge, Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { usePoll } from '../../../lib/usePoll';

interface FeedbackRow {
  id: string;
  slug: string;
  message: string;
  contact: string | null;
  status: string;
  created_at: string;
}

/** ISO timestamp → "07-07 19:05" (UTC, deterministic — mirrors FleetTimeline). */
function fmtTime(ts: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(ts);
  if (!m) return ts;
  return `${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
}

async function fetchFeedback(signal: AbortSignal): Promise<FeedbackRow[]> {
  const res = await fetch('/api/portal-verify?feedback=1', { signal });
  if (!res.ok) throw new Error(`feedback fetch → ${res.status}`);
  const body = (await res.json()) as { items?: FeedbackRow[] };
  return body.items ?? [];
}

export function ClientFeedbackPanel({ limit = 15 }: { limit?: number }) {
  const { data, isOffline, isInitialLoading } = usePoll(fetchFeedback, {
    intervalMs: 60_000,
    offlineIntervalMs: 5 * 60_000,
  });

  if (isInitialLoading) return <p style={s.empty}>Loading client feedback…</p>;
  if (isOffline || data === null) {
    return <p style={s.empty}>Feedback store offline — check Supabase env / migration 0012.</p>;
  }
  if (data.length === 0) {
    return <p style={s.empty}>No client feedback yet — notes from /c/:slug portals land here.</p>;
  }

  return (
    <Stack direction="column" gap="px8">
      {data.slice(0, limit).map((r) => (
        <Stack key={r.id} direction="column" gap="px4" style={s.row}>
          <Stack direction="row" align="center" gap="px8">
            <Badge tone={r.status === 'done' ? 'success' : 'info'}>{r.slug}</Badge>
            <span style={s.time}>{fmtTime(r.created_at)}</span>
            {r.contact && <span style={s.time}>{r.contact}</span>}
          </Stack>
          <span style={s.message}>{r.message}</span>
        </Stack>
      ))}
    </Stack>
  );
}

const s = {
  empty: {
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-secondary)',
    margin: 0,
  } as CSSProperties,
  row: {
    paddingBottom: hds.space.px8,
    borderBottom: '1px solid var(--semantic-color-border-default)',
  } as CSSProperties,
  time: {
    ...hds.typeStyles.mono,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  message: {
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-primary)',
  } as CSSProperties,
};
