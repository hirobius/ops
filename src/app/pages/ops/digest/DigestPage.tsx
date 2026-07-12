/* hds-bypass: ops-internal page. Inline styles intentional for ops dashboard. */

/**
 * DigestPage — /ops/digest.
 *
 * Review surface for newsletter/intel digests. Items are seeded from
 * checked-in JSON under src/app/digests/*.json (scripts/seed-digest-items.mjs,
 * produced on demand by a Claude session that reads the inbox — no cron, no
 * server keys) into the `digest_items` store (migration 0011), so each item
 * now carries a real status lifecycle (ops#78, Digest → Issue epic #77 P1):
 * dismiss moves an item out of the main flow into a collapsible stash;
 * restore brings it back. Analyze/promote (P2-P4, LLM-backed) land on the
 * same rows later.
 *
 * Reads GET /api/digest (useDigestItems polls); mutates via POST
 * /api/digest-action (useDigestActions).
 */

import { useMemo, useState } from 'react';
import { Button, SegmentedControl, Tag } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import type { CSSProperties } from 'react';
import { PageHeader } from '../PageHeader';
import { useDigestItems } from './useDigestItems';
import { useDigestActions } from './useDigestActions';
import type { DigestItem, DigestItemStatus } from './types';

type StatusFilter = DigestItemStatus | 'all';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'all' },
  { value: 'new', label: 'new' },
  { value: 'analyzed', label: 'analyzed' },
  { value: 'promoted', label: 'promoted' },
];

function formatLastUpdated(epochMs: number | null): string {
  if (!epochMs) return 'never';
  const s = Math.floor((Date.now() - epochMs) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return new Date(epochMs).toLocaleTimeString();
}

/** Groups items by date, newest date first; items within a date keep server order. */
function groupByDate(items: DigestItem[]): [string, DigestItem[]][] {
  const byDate = new Map<string, DigestItem[]>();
  for (const item of items) {
    const list = byDate.get(item.date);
    if (list) list.push(item);
    else byDate.set(item.date, [item]);
  }
  return [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

export default function DigestPage() {
  const { items, isOffline, isInitialLoading, lastUpdatedAt, refetch } = useDigestItems();
  const { act, busyKeys } = useDigestActions(refetch);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [stashOpen, setStashOpen] = useState(false);

  const live = useMemo(() => (items ?? []).filter((i) => i.status !== 'dismissed'), [items]);
  const dismissed = useMemo(() => (items ?? []).filter((i) => i.status === 'dismissed'), [items]);

  const filtered = useMemo(
    () => (statusFilter === 'all' ? live : live.filter((i) => i.status === statusFilter)),
    [live, statusFilter],
  );

  const groups = useMemo(() => groupByDate(filtered), [filtered]);
  const dismissedGroups = useMemo(() => groupByDate(dismissed), [dismissed]);

  return (
    <div style={s.page}>
      <PageHeader
        breadcrumbs={[{ label: 'Ops', href: '/ops' }, { label: 'Digest' }]}
        title="Digest"
        lede="Newsletter intel, pre-triaged with an ops angle — read, open, decide."
      />

      <div style={s.controls}>
        <SegmentedControl
          aria-label="Filter by status"
          size="sm"
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
        />
        <span style={s.spacer} />
        <span style={s.statusLine}>
          {isOffline
            ? 'offline'
            : isInitialLoading
              ? 'loading…'
              : `${filtered.length} shown · updated ${formatLastUpdated(lastUpdatedAt)}`}
        </span>
        <Button size="sm" variant="secondary" onClick={refetch}>
          refresh
        </Button>
      </div>

      {isOffline && (
        <p style={s.empty}>
          {import.meta.env.DEV ? (
            <>
              Can&apos;t reach the digest API. In dev, ensure{' '}
              <code style={s.code}>SUPABASE_URL</code> +{' '}
              <code style={s.code}>SUPABASE_SERVICE_ROLE_KEY</code> are set and the table exists
              (migration <code style={s.code}>0011_digest_items.sql</code>).
            </>
          ) : (
            'Digest is temporarily unavailable — the data service isn’t responding. Try refresh in a moment.'
          )}
        </p>
      )}

      {!isOffline && isInitialLoading && <p style={s.empty}>Loading digest…</p>}

      {!isOffline && items && items.length === 0 && (
        <p style={s.empty}>
          No digest items yet. Ask a Claude session to scrub the inbox — it commits a JSON under
          src/app/digests/, then run <code style={s.code}>node scripts/seed-digest-items.mjs --apply</code>{' '}
          to import it.
        </p>
      )}

      {!isOffline && items && items.length > 0 && filtered.length === 0 && (
        <p style={s.empty}>No items match this filter.</p>
      )}

      {!isOffline &&
        groups.map(([date, dateItems]) => (
          <section key={date}>
            <div style={s.sectionMeta}>
              <span style={s.sectionDate}>{date}</span>
              <span style={s.sectionSource}>{dateItems[0]?.source ?? ''}</span>
            </div>

            {dateItems.map((item) => (
              <DigestItemRow
                key={item.item_key}
                item={item}
                busy={busyKeys.has(item.item_key)}
                actionLabel="Dismiss"
                onAction={() => act(item.item_key, 'dismiss')}
              />
            ))}
          </section>
        ))}

      {!isOffline && dismissed.length > 0 && (
        <section style={s.stash}>
          <button
            type="button"
            className="hds-focus"
            style={s.stashToggle}
            aria-expanded={stashOpen}
            onClick={() => setStashOpen((v) => !v)}
          >
            {stashOpen ? '▾' : '▸'} Dismissed ({dismissed.length})
          </button>

          {stashOpen &&
            dismissedGroups.map(([date, dateItems]) => (
              <section key={date}>
                <div style={s.sectionMeta}>
                  <span style={s.sectionDate}>{date}</span>
                  <span style={s.sectionSource}>{dateItems[0]?.source ?? ''}</span>
                </div>

                {dateItems.map((item) => (
                  <DigestItemRow
                    key={item.item_key}
                    item={item}
                    busy={busyKeys.has(item.item_key)}
                    actionLabel="Restore"
                    onAction={() => act(item.item_key, 'restore')}
                  />
                ))}
              </section>
            ))}
        </section>
      )}
    </div>
  );
}

function DigestItemRow({
  item,
  busy,
  actionLabel,
  onAction,
}: {
  item: DigestItem;
  busy: boolean;
  actionLabel: 'Dismiss' | 'Restore';
  onAction: () => void;
}) {
  return (
    <article style={s.item}>
      <div style={s.itemHeader}>
        <h3 style={s.itemTitle}>{item.title}</h3>
        <Button size="sm" variant="secondary" disabled={busy} onClick={onAction}>
          {busy ? '…' : actionLabel}
        </Button>
      </div>
      {item.summary && <p style={s.itemSummary}>{item.summary}</p>}
      {item.ops_angle && (
        <p style={s.itemAngle}>
          <span style={s.itemAngleLabel}>For ops · </span>
          {item.ops_angle}
        </p>
      )}
      <div style={s.itemMeta}>
        {item.tag && <span style={s.itemTag}>{item.tag}</span>}
        {item.links.map((l) => (
          <a
            key={l.url}
            href={l.url}
            target="_blank"
            rel="noreferrer"
            className="hds-focus"
            style={s.itemLink}
          >
            {l.label} ↗
          </a>
        ))}
        {item.status !== 'new' && item.status !== 'dismissed' && <Tag>{item.status}</Tag>}
      </div>
    </article>
  );
}

const s = {
  page: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px24,
    padding: `${hds.space.px24} ${hds.space.px24} ${hds.space.px48}`,
    minHeight: '100vh',
    background: 'var(--semantic-color-surface-page)',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px12,
    flexWrap: 'wrap' as const,
  },
  spacer: { flex: 1 },
  statusLine: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  },
  empty: {
    margin: 0,
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-secondary)',
  },
  code: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-primary)',
    background: 'var(--semantic-color-surface-raised)',
    padding: `0 ${hds.space.px4}`,
    borderRadius: hds.borderRadius[2],
  },
  sectionMeta: {
    display: 'flex',
    alignItems: 'baseline',
    gap: hds.space.px12,
    flexWrap: 'wrap' as const,
    paddingBottom: hds.space.px8,
    borderBottom: '1px solid var(--semantic-color-border-default)',
  },
  sectionDate: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-primary)',
  },
  sectionSource: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  },
  item: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px4,
    padding: `${hds.space.px16} 0`,
    borderBottom: '1px solid var(--semantic-color-border-default)',
  },
  itemHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: hds.space.px12,
  },
  itemTitle: {
    margin: 0,
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-primary)',
  },
  itemSummary: {
    margin: 0,
    ...hds.typeStyles.bodySmall,
    color: 'var(--semantic-color-content-secondary)',
  },
  itemAngle: {
    margin: 0,
    ...hds.typeStyles.bodySmall,
    color: 'var(--semantic-color-content-primary)',
  },
  itemAngleLabel: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  },
  itemMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px12,
    flexWrap: 'wrap' as const,
    paddingTop: hds.space.px4,
  },
  itemTag: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  },
  itemLink: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-accent)',
    textDecoration: 'none',
  },
  stash: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px12,
    paddingTop: hds.space.px12,
    borderTop: '1px solid var(--semantic-color-border-default)',
  },
  stashToggle: {
    alignSelf: 'flex-start',
    ...hds.typeStyles.ui,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
  },
} satisfies Record<string, CSSProperties>;
