/* hds-bypass: ops-internal page. Inline styles intentional for ops dashboard. */

/**
 * IssuesPage — /ops/issues.
 *
 * Read-mostly view of every open GitHub issue across all repos the GITHUB_TOKEN
 * can see (GET /api/issues). Grouped by repo, filterable, with multi-select →
 * "copy refs" so a batch of `owner/repo#123` refs can be pasted into a Claude
 * chat. The command-center's cross-repo lens; GitHub stays the source of truth.
 */

import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { Button, Badge } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { PageHeader } from '../PageHeader';
import { useIssues } from './useIssues';
import { issueRef, type Issue } from './types';

function relTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(s)) return '';
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard unavailable — no-op */
  }
}

export default function IssuesPage() {
  const { issues, isOffline, isInitialLoading, lastUpdatedAt, refetch } = useIssues();
  const [repoFilter, setRepoFilter] = useState<string>('all');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const repos = useMemo(() => {
    const set = new Set<string>();
    (issues ?? []).forEach((i) => set.add(i.repo));
    return [...set].sort();
  }, [issues]);

  const filtered = useMemo(
    () => (issues ?? []).filter((i) => repoFilter === 'all' || i.repo === repoFilter),
    [issues, repoFilter],
  );

  const byRepo = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const i of filtered) {
      const arr = map.get(i.repo);
      if (arr) arr.push(i);
      else map.set(i.repo, [i]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const toggle = useCallback((ref: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  }, []);

  const copySelected = useCallback(() => {
    void copy([...selected].join('\n'));
  }, [selected]);

  const summary = issues
    ? `${filtered.length} shown · ${issues.length} open · ${repos.length} repos`
    : '';

  return (
    <div style={s.page}>
      <PageHeader
        breadcrumbs={[{ label: 'Ops', href: '/ops' }, { label: 'Issues' }]}
        title="Issues"
        lede="Every open GitHub issue across your repos, in one place. GitHub is the source of truth — select any to copy their refs into a chat."
      />

      <div style={s.controls}>
        <div style={s.filterGroup}>
          <button
            type="button"
            onClick={() => setRepoFilter('all')}
            style={repoFilter === 'all' ? s.pillActive : s.pill}
          >
            all
          </button>
          {repos.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRepoFilter(r)}
              style={r === repoFilter ? s.pillActive : s.pill}
              title={r}
            >
              {r.split('/')[1] ?? r}
            </button>
          ))}
        </div>
        <span style={s.spacer} />
        <span style={s.statusLine}>
          {isOffline
            ? 'offline'
            : isInitialLoading
              ? 'loading…'
              : `${summary} · updated ${lastUpdatedAt ? relTime(new Date(lastUpdatedAt).toISOString()) : 'never'}`}
        </span>
        <Button size="sm" variant="secondary" onClick={refetch}>
          refresh
        </Button>
      </div>

      {selected.size > 0 && (
        <div style={s.batchBar}>
          <span style={s.batchCount}>{selected.size} selected</span>
          <Button size="sm" variant="primary" onClick={copySelected}>
            Copy refs
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {isOffline && (
        <p style={s.notice}>
          Can&apos;t reach the issues API. Ensure <code style={s.code}>GITHUB_TOKEN</code> is set in
          Vercel (Production, Issues: read) and redeployed.
        </p>
      )}
      {!isOffline && isInitialLoading && <p style={s.notice}>Loading issues…</p>}
      {!isOffline && !isInitialLoading && filtered.length === 0 && (
        <p style={s.notice}>No open issues.</p>
      )}

      {byRepo.map(([repo, list]) => (
        <section key={repo} style={s.group}>
          <div style={s.groupHead}>
            <span style={s.groupName}>{repo}</span>
            <span style={s.groupCount}>{list.length}</span>
          </div>
          {list.map((i) => {
            const ref = issueRef(i);
            const on = selected.has(ref);
            return (
              <div key={ref} style={s.row}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(ref)}
                  style={on ? s.checkOn : s.check}
                  title={on ? 'Deselect' : 'Add to batch'}
                >
                  {on ? '✓' : ''}
                </button>
                <div style={s.rowMain}>
                  <a href={i.url} target="_blank" rel="noreferrer" style={s.title}>
                    <span style={s.num}>#{i.number}</span> {i.title} ↗
                  </a>
                  {i.labels.length > 0 && (
                    <span style={s.labels}>
                      {i.labels.map((l) => (
                        <Badge key={l} tone="neutral">
                          {l}
                        </Badge>
                      ))}
                    </span>
                  )}
                </div>
                <span style={s.rowMeta}>{relTime(i.updated_at)}</span>
                <Button size="sm" variant="secondary" onClick={() => void copy(ref)} title={`Copy ${ref}`}>
                  copy #
                </Button>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

const pillBase: CSSProperties = {
  ...hds.typeStyles.ui,
  padding: `${hds.space.px4} ${hds.space.px10}`,
  borderRadius: hds.borderRadius.action,
  border: '1px solid var(--semantic-color-border-default)',
  background: 'transparent',
  color: 'var(--semantic-color-content-secondary)',
  cursor: 'pointer',
};

const s = {
  page: { display: 'flex', flexDirection: 'column', gap: hds.space.px20 } as CSSProperties,
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px8,
    flexWrap: 'wrap' as const,
  } as CSSProperties,
  filterGroup: { display: 'flex', gap: hds.space.px6, flexWrap: 'wrap' as const } as CSSProperties,
  pill: pillBase,
  pillActive: {
    ...pillBase,
    background: 'var(--semantic-color-content-accent)',
    color: 'var(--semantic-color-content-onAccent)',
    borderColor: 'var(--semantic-color-content-accent)',
  } as CSSProperties,
  spacer: { flex: 1 } as CSSProperties,
  statusLine: {
    ...hds.typeStyles.caption,
    color: 'var(--semantic-color-content-secondary)',
    fontVariantNumeric: 'tabular-nums',
  } as CSSProperties,
  batchBar: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px8,
    padding: hds.space.px8,
    borderRadius: hds.borderRadius.action,
    background: 'var(--semantic-color-surface-raised)',
  } as CSSProperties,
  batchCount: {
    ...hds.typeStyles.ui,
    color: 'var(--semantic-color-content-primary)',
    fontWeight: hds.fontWeight.semibold,
  } as CSSProperties,
  notice: {
    margin: 0,
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  code: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    padding: `0 ${hds.space.px4}`,
    borderRadius: hds.borderRadius[4],
    background: 'var(--semantic-color-surface-raised)',
  } as CSSProperties,
  group: { display: 'flex', flexDirection: 'column', gap: hds.space.px6 } as CSSProperties,
  groupHead: {
    display: 'flex',
    alignItems: 'baseline',
    gap: hds.space.px8,
    paddingBottom: hds.space.px4,
    borderBottom: '1px solid var(--semantic-color-border-default)',
  } as CSSProperties,
  groupName: {
    ...hds.typeStyles.ui,
    fontWeight: hds.fontWeight.semibold,
    color: 'var(--semantic-color-content-primary)',
  } as CSSProperties,
  groupCount: {
    ...hds.typeStyles.caption,
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px8,
    padding: `${hds.space.px6} 0`,
  } as CSSProperties,
  check: {
    width: hds.space.px20,
    height: hds.space.px20,
    flexShrink: 0,
    borderRadius: hds.borderRadius[4],
    border: '1px solid var(--semantic-color-border-default)',
    background: 'transparent',
    color: 'var(--semantic-color-content-onAccent)',
    cursor: 'pointer',
  } as CSSProperties,
  checkOn: {
    width: hds.space.px20,
    height: hds.space.px20,
    flexShrink: 0,
    borderRadius: hds.borderRadius[4],
    border: '1px solid var(--semantic-color-content-accent)',
    background: 'var(--semantic-color-content-accent)',
    color: 'var(--semantic-color-content-onAccent)',
    cursor: 'pointer',
  } as CSSProperties,
  rowMain: { display: 'flex', flexDirection: 'column', gap: hds.space.px2, minWidth: 0, flex: 1 } as CSSProperties,
  title: {
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-primary)',
    textDecoration: 'none',
  } as CSSProperties,
  num: { color: 'var(--semantic-color-content-secondary)', fontVariantNumeric: 'tabular-nums' } as CSSProperties,
  labels: { display: 'flex', gap: hds.space.px4, flexWrap: 'wrap' as const, marginTop: hds.space.px2 } as CSSProperties,
  rowMeta: {
    ...hds.typeStyles.caption,
    color: 'var(--semantic-color-content-secondary)',
    flexShrink: 0,
  } as CSSProperties,
} as const;
