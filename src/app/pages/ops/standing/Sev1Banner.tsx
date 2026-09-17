/* hds-bypass: ops-internal page. Inline styles intentional for ops dashboard. */

/**
 * Sev1Banner — every open sev1 across the fleet, at the top of /ops/standing.
 *
 * ops#317: severity is orthogonal to priority. ops#27 (client PII in public git
 * history, with an unmet disclosure obligation) sat at p1 for 71 days as one
 * line among fifty, and nothing surfaced it. So a sev1 does not go in a lane —
 * it goes above all of them, and stays until the issue is closed or explicitly
 * accepted. When nothing is open at sev1 this renders nothing at all.
 *
 * Same list as `pnpm sev1:check`, from the same definition
 * (`lib/tasks/severity.mjs`), so the page and the gate cannot disagree.
 */

import { useId } from 'react';
import type { CSSProperties } from 'react';
import { Badge } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { shortRepo, type FleetIssue } from '../ralphStatus';
import { SEVERITY_LADDER } from '../../../../../lib/tasks/severity.mjs';

const SEV1_MEANS = SEVERITY_LADDER[0].means;

export function Sev1Banner({ sev1 }: { sev1: readonly FleetIssue[] }) {
  const headingId = useId();
  if (sev1.length === 0) return null;

  return (
    <section style={s.banner} aria-labelledby={headingId}>
      <div style={s.head}>
        <h2 id={headingId} style={s.title}>
          Open sev1
        </h2>
        <span style={s.count}>{sev1.length} open</span>
      </div>
      <p style={s.means}>
        {SEV1_MEANS}. Stays at the top of this page until closed or explicitly accepted.
      </p>
      <ul style={s.list}>
        {sev1.map((i) => (
          <li key={`${i.repo}#${i.number}`} style={s.row}>
            <a href={i.url} target="_blank" rel="noreferrer" className="hds-focus" style={s.link}>
              <span style={s.num}>#{i.number}</span>
              <span style={s.issueTitle}>{i.title}</span>
            </a>
            <div style={s.meta}>
              <Badge tone="danger">sev1</Badge>
              <span style={s.repo}>
                {shortRepo(i.repo)}
                {i.prio ? ` · ${i.prio}` : ''}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const s = {
  banner: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px8,
    padding: hds.space.px16,
    borderLeft: '3px solid var(--semantic-color-feedback-error)',
    borderRadius: `0 ${hds.borderRadius.sm} ${hds.borderRadius.sm} 0`,
    background: 'var(--semantic-color-surface-raised)',
  },
  head: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: hds.space.px12,
  },
  title: {
    ...hds.typeStyles.h3,
    margin: 0,
    color: 'var(--semantic-color-content-primary)',
  },
  count: {
    ...hds.typeStyles.labelTechnical,
    color: 'var(--semantic-color-feedback-error)',
    whiteSpace: 'nowrap' as const,
  },
  means: {
    ...hds.typeStyles.bodySmall,
    margin: 0,
    color: 'var(--semantic-color-content-secondary)',
    maxWidth: '60ch',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column' as const,
  },
  row: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px4,
    padding: `${hds.space.px8} 0`,
  },
  link: {
    display: 'flex',
    alignItems: 'baseline',
    gap: hds.space.px8,
    textDecoration: 'none',
    minWidth: 0,
  },
  num: {
    ...hds.typeStyles.labelTechnical,
    color: 'var(--semantic-color-content-accent)',
    flexShrink: 0,
  },
  issueTitle: {
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-primary)',
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: hds.space.px6,
  },
  repo: {
    ...hds.typeStyles.caption,
    color: 'var(--semantic-color-content-secondary)',
  },
} satisfies Record<string, CSSProperties>;
