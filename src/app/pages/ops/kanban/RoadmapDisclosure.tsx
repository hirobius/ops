/* hds-bypass: ops-internal page */

import { useState, type CSSProperties } from 'react';
import hds from '@hirobius/design-system/tokens';
import { Badge } from '@hirobius/design-system';
import roadmapData from '../../../data/roadmap.json';

interface RoadmapItem {
  status: string;
  title: string;
  detail?: string;
  category?: string;
}

interface RoadmapGroup {
  title: string;
  items: RoadmapItem[];
}

interface RoadmapSection {
  id: string;
  label: string;
  groups: RoadmapGroup[];
}

function statusTone(status: string): 'neutral' | 'info' | 'warning' {
  if (status === 'in-progress') return 'info';
  if (status === 'blocked') return 'warning';
  return 'neutral';
}

const sections = (roadmapData as unknown as { sections: RoadmapSection[] }).sections;

const totalItems = sections.reduce(
  (acc, sec) => acc + sec.groups.reduce((a, g) => a + g.items.length, 0),
  0,
);

export function RoadmapDisclosure() {
  const [expanded, setExpanded] = useState(false);

  return (
    <section style={s.root} aria-labelledby="roadmap-disclosure-eyebrow">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="hds-focus"
        style={s.toggle}
        aria-expanded={expanded}
        aria-controls="roadmap-disclosure-body"
      >
        <span style={s.chevron} aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
        <span id="roadmap-disclosure-eyebrow" style={s.eyebrow}>
          roadmap
        </span>
        <span style={s.count}>{totalItems}</span>
        <span style={s.subtitle}>
          <code style={s.code}>src/app/data/roadmap.json</code>
          {' · '}
          <code style={s.code}>pnpm roadmap:watch</code> to rebuild
        </span>
      </button>

      {expanded && (
        <div id="roadmap-disclosure-body" style={s.body}>
          {sections.map((sec) => {
            const allItems = sec.groups.flatMap((g) => g.items);
            if (allItems.length === 0) return null;
            return (
              <div key={sec.id} style={s.section}>
                <div style={s.sectionHead}>
                  <span style={s.sectionLabel}>{sec.label}</span>
                  <span style={s.sectionCount}>{allItems.length}</span>
                </div>
                {sec.groups.map((group, gi) => (
                  <div key={gi} style={s.group}>
                    {group.title && <span style={s.groupTitle}>{group.title}</span>}
                    {group.items.map((item, ii) => {
                      const isLast = gi === sec.groups.length - 1 && ii === group.items.length - 1;
                      return (
                        <div
                          key={ii}
                          style={{
                            ...s.row,
                            borderBottom: isLast
                              ? 'none'
                              : '1px solid var(--semantic-color-border-default)',
                          }}
                        >
                          <div style={s.identity}>
                            <span style={s.itemTitle}>{item.title}</span>
                            {item.detail && <span style={s.itemDetail}>{item.detail}</span>}
                          </div>
                          <div style={s.badges}>
                            {item.category && <Badge tone="neutral">{item.category}</Badge>}
                            <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })}
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
  code: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize['2xs'],
    background: 'var(--semantic-color-surface-page)',
    padding: `0 ${hds.space.px4}`,
    borderRadius: hds.borderRadius[2],
  },
  body: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px16,
    paddingTop: hds.space.px8,
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px4,
  },
  sectionHead: {
    display: 'flex',
    alignItems: 'baseline',
    gap: hds.space.px8,
    paddingBottom: hds.space.px4,
    borderBottom: '1px solid var(--semantic-color-border-default)',
  },
  sectionLabel: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    textTransform: 'uppercase' as const, // eyebrow-ok: roadmap section kicker
    letterSpacing: '0.08em',
    color: 'var(--semantic-color-content-secondary)',
  },
  sectionCount: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-disabled)',
  },
  group: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  groupTitle: {
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
    fontStyle: 'italic',
    padding: `${hds.space.px4} 0`,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto', // grid-ok: title block + badges
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
  itemTitle: {
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  itemDetail: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize['2xs'],
    color: 'var(--semantic-color-content-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  badges: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px8,
    flexWrap: 'wrap' as const,
    flexShrink: 0,
  },
} satisfies Record<string, CSSProperties>;
