/* hds-bypass: ops-internal page. Inline styles intentional for standalone ops surface. */

import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { Page } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { PageHeader } from './PageHeader';

const PILLARS = [
  {
    to: '/ops/clients',
    label: 'Grow',
    description: 'Client pipeline · retainers · prospects',
  },
  {
    to: '/ops/atlas',
    label: 'Run',
    description: 'Guardrail registry · routes · component inventory',
  },
] as const;

export default function KnowledgePage() {
  return (
    <Page>
      <div style={s.root}>
        <PageHeader
          breadcrumbs={[{ label: 'Ops', href: '/ops' }, { label: 'Knowledge' }]}
          title="Knowledge"
        />
        <nav aria-label="Operational pillars" style={s.grid}>
          {PILLARS.map((p) => (
            <Link key={p.to} to={p.to} className="hds-focus" style={s.tile}>
              <div style={s.text}>
                <span style={s.label}>{p.label}</span>
                <span style={s.desc}>{p.description}</span>
              </div>
              <ArrowRight
                size={14}
                color="var(--semantic-color-content-secondary)"
                aria-hidden="true"
              />
            </Link>
          ))}
        </nav>
      </div>
    </Page>
  );
}

const s = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px24,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: hds.space.px12,
  },
  tile: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: hds.space.px16,
    padding: `${hds.space.px12} ${hds.space.px16}`,
    background: 'var(--semantic-color-surface-raised)',
    borderRadius: hds.borderRadius[8],
    textDecoration: 'none' as const,
    color: 'inherit',
    minWidth: 0,
  },
  text: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px2,
    minWidth: 0,
  },
  label: {
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-primary)',
  },
  desc: {
    ...hds.typeStyles.ui,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
} satisfies Record<string, CSSProperties>;
