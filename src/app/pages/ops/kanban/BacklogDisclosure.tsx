/* hds-bypass: ops-internal page */

import { useMemo, useState, type CSSProperties } from 'react';
import hds from '@hirobius/design-system/tokens';
import { Badge } from '@hirobius/design-system';
import { Button } from '@hirobius/design-system';
import type { ProposedUnitEntry } from './threads-types';
import { promoteProposedUnit, type PromoteResult } from './promoteThread';
import { PromotePopover } from './PromotePopover';

interface BacklogDisclosureProps {
  items: ProposedUnitEntry[];
  assignees: string[];
  onPromoted: () => void;
}

const REASON_TONE: Record<ProposedUnitEntry['reason'], 'neutral' | 'danger' | 'info' | 'warning'> =
  {
    blocker: 'danger',
    'side-quest': 'info',
    cleanup: 'warning',
  };

const URGENCY_RANK: Record<string, number> = {
  immediate: 0,
  blocking: 0,
  soon: 1,
  next: 1,
  eventually: 2,
};

function urgencyRankOf(u: string): number {
  const r = URGENCY_RANK[u.toLowerCase()];
  return r !== undefined ? r : 3;
}

function relativeAge(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const delta = Math.max(0, Date.now() - t);
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function BacklogDisclosure({ items, assignees, onPromoted }: BacklogDisclosureProps) {
  const [expanded, setExpanded] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const ru = urgencyRankOf(a.urgency) - urgencyRankOf(b.urgency);
      if (ru !== 0) return ru;
      return Date.parse(b.ts) - Date.parse(a.ts);
    });
  }, [items]);

  return (
    <section style={s.root} aria-labelledby="backlog-disclosure-eyebrow">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="hds-focus"
        style={s.toggle}
        aria-expanded={expanded}
        aria-controls="backlog-disclosure-list"
      >
        <span style={s.chevron} aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
        <span id="backlog-disclosure-eyebrow" style={s.eyebrow}>
          backlog
        </span>
        <span style={s.count}>{items.length}</span>
        <span style={s.subtitle}>
          agent-proposed units · <code style={s.code}>docs/ai/proposed-units.jsonl</code>
        </span>
      </button>
      {expanded && (
        <div id="backlog-disclosure-list" style={s.list}>
          {sorted.length === 0 ? (
            <div style={s.empty}>No proposed units yet.</div>
          ) : (
            sorted.map((entry, idx) => {
              const u = entry.proposedUnit;
              const isLast = idx === sorted.length - 1;
              return (
                <div
                  key={u.id}
                  style={{
                    ...s.row,
                    borderBottom: isLast
                      ? 'none'
                      : '1px solid var(--semantic-color-border-default)',
                  }}
                >
                  <div style={s.identity}>
                    <span style={s.title}>{u.name}</span>
                    <span style={s.meta}>
                      <code style={s.code}>{u.id}</code>
                      {' · '}
                      from <code style={s.code}>{entry.fromUnitId}</code>
                    </span>
                  </div>
                  <div style={s.badges}>
                    <Badge tone={REASON_TONE[entry.reason]}>{entry.reason}</Badge>
                    {u.tier && <Badge tone="neutral">{u.tier}</Badge>}
                    <span style={s.age}>{relativeAge(entry.ts)}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setOpenKey(openKey === u.id ? null : u.id)}
                    aria-expanded={openKey === u.id}
                  >
                    {openKey === u.id ? 'cancel' : 'promote'}
                  </Button>
                  {openKey === u.id && (
                    <div style={s.popoverAnchor}>
                      <PromotePopover
                        defaultTitle={u.name}
                        assignees={assignees}
                        onClose={() => setOpenKey(null)}
                        hint={
                          <>
                            Promotes <code style={s.code}>{u.id}</code> to the{' '}
                            <code style={s.code}>hds</code> board.
                          </>
                        }
                        onConfirm={async ({
                          titleOverride,
                          assignee,
                          target,
                        }): Promise<PromoteResult> => {
                          const result = await promoteProposedUnit({
                            entry,
                            titleOverride,
                            assignee,
                            target,
                          });
                          if (result.ok) onPromoted();
                          return result;
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}

const s = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    paddingBottom: hds.space.px16,
    borderBottom: '1px solid var(--semantic-color-border-default)',
  },
  toggle: {
    display: 'flex',
    alignItems: 'baseline',
    gap: hds.space.px8,
    background: 'transparent',
    border: 'none',
    padding: `${hds.space.px8} 0`,
    cursor: 'pointer',
    color: 'inherit',
    textAlign: 'left' as const,
    flexWrap: 'wrap' as const,
  },
  chevron: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-secondary)',
    width: '16px',
  },
  eyebrow: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    textTransform: 'uppercase' as const, // eyebrow-ok: section kicker
    letterSpacing: '0.08em',
    color: 'var(--semantic-color-content-secondary)',
  },
  count: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-disabled)',
  },
  subtitle: {
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    paddingTop: hds.space.px8,
  },
  empty: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-disabled)',
    padding: `${hds.space.px16} 0`,
  },
  row: {
    position: 'relative' as const,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto auto', // grid-ok: identity + badges + action
    columnGap: hds.space.px12,
    alignItems: 'center',
    padding: `${hds.space.px8} 0`,
    minWidth: 0,
  },
  identity: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px2,
    minWidth: 0,
  },
  title: {
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  meta: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize['2xs'],
    color: 'var(--semantic-color-content-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  badges: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px8,
    flexWrap: 'wrap' as const,
  },
  age: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize['2xs'],
    color: 'var(--semantic-color-content-disabled)',
    whiteSpace: 'nowrap',
  },
  popoverAnchor: {
    gridColumn: '1 / -1',
    marginTop: hds.space.px8,
    paddingTop: hds.space.px8,
    display: 'flex',
    justifyContent: 'flex-start',
  },
  code: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize['2xs'],
    background: 'var(--semantic-color-surface-page)',
    padding: `0 ${hds.space.px4}`,
    borderRadius: hds.borderRadius[2],
  },
} satisfies Record<string, CSSProperties>;
