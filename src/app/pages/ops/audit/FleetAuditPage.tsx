/* hds-bypass: ops-internal page */

/**
 * FleetAuditPage — `/ops/audit`. The standing record of what a fleet-wide audit
 * found and what each resulting issue is FOR.
 *
 * Why this exists rather than a chat message: an audit's value is not the list
 * of issue numbers — GitHub has those — it is the reasoning that produced them,
 * which otherwise lives only in a session transcript nobody will reopen.
 *
 * WHAT IT DELIBERATELY DOES NOT SHOW: whether an issue is open or closed. That
 * is volatile, GitHub owns it, and asserting it here would manufacture exactly
 * the rot that hds#285, hds#281 and ops#417 are about — a confident summary that
 * quietly stops being true. Every issue is a link; the reader clicks for state.
 * Build health carries the date it was measured for the same reason.
 *
 * Data: docs/ai/fleet-audit.json. Append an audit; never edit entries to mark
 * work done.
 *
 * @category Internal
 * @tier utility
 */

import { type CSSProperties } from 'react';

import { Page, Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';

import { PageHeader } from '../PageHeader';
import auditData from '../../../../../docs/ai/fleet-audit.json';

type HealthState = 'green' | 'risk' | 'red';

interface HealthRow {
  name: string;
  state: string;
  detail: string;
}
interface AuditIssue {
  ref: string;
  title: string;
  accomplishes: string;
}
interface AuditTheme {
  name: string;
  summary: string;
  issues: AuditIssue[];
}
interface Audit {
  date: string;
  title: string;
  session?: string;
  verdict: string;
  buildHealth: HealthRow[];
  themes: AuditTheme[];
}

const audits = (auditData as { audits: Audit[] }).audits;

/** `hds#284` → the issue URL. One place, so a typo cannot produce a plausible dead link. */
function issueUrl(ref: string): string | null {
  const m = /^([a-z-]+)#(\d+)$/.exec(ref.trim());
  return m ? `https://github.com/hirobius/${m[1]}/issues/${m[2]}` : null;
}

// CSS vars rather than the JS map: hds.color.feedback.* are {dark, light}
// objects, so the var is the only value that resolves per theme.
const STATE_COLOR: Record<HealthState, string> = {
  green: 'var(--semantic-color-feedback-success)',
  risk: 'var(--semantic-color-feedback-warning)',
  red: 'var(--semantic-color-feedback-error)',
};

function stateColor(state: string): string {
  return STATE_COLOR[state as HealthState] ?? 'var(--semantic-color-content-secondary)';
}

/** @public */
export default function FleetAuditPage() {
  return (
    <Page>
      <Stack direction="column" gap="px40">
        <PageHeader
          breadcrumbs={[{ label: 'Ops', href: '/ops' }, { label: 'Audit' }]}
          title="Fleet audit"
        />

        {audits.map((audit) => (
          <Stack key={audit.date} direction="column" gap="px32">
            <Stack direction="column" gap="px8">
              <span style={s.eyebrow}>{audit.date}</span>
              <h2 style={s.auditTitle}>{audit.title}</h2>
              <p style={s.verdict}>{audit.verdict}</p>
            </Stack>

            <section aria-labelledby={`health-${audit.date}`}>
              <h3 id={`health-${audit.date}`} style={s.sectionHeading}>
                Build health
              </h3>
              <p style={s.asOf}>Measured {audit.date}. Not live — re-run to refresh.</p>
              <Stack direction="column" gap="px2" style={{ marginTop: hds.space.px12 }}>
                {audit.buildHealth.map((row) => (
                  <div key={row.name} style={s.band}>
                    <span
                      style={{ ...s.dot, background: stateColor(row.state) }}
                      aria-hidden="true"
                    />
                    <Stack direction="column" gap="px2" style={{ minWidth: 0 }}>
                      <span style={s.bandLabel}>
                        {row.name}
                        <span style={s.srOnly}>{` — ${row.state}`}</span>
                      </span>
                      <span style={s.bandDetail}>{row.detail}</span>
                    </Stack>
                  </div>
                ))}
              </Stack>
            </section>

            {audit.themes.map((theme) => (
              <section key={theme.name} aria-labelledby={`t-${audit.date}-${theme.name}`}>
                <h3 id={`t-${audit.date}-${theme.name}`} style={s.sectionHeading}>
                  {theme.name}
                </h3>
                <p style={s.themeSummary}>{theme.summary}</p>
                <Stack direction="column" gap="px2" style={{ marginTop: hds.space.px12 }}>
                  {theme.issues.map((issue) => {
                    const href = issueUrl(issue.ref);
                    return (
                      <div key={issue.ref} style={s.band}>
                        <Stack direction="column" gap="px4" style={{ minWidth: 0 }}>
                          <span style={s.issueHead}>
                            {href ? (
                              <a href={href} className="hds-focus" style={s.ref}>
                                {issue.ref}
                              </a>
                            ) : (
                              <span style={s.ref}>{issue.ref}</span>
                            )}
                            <span style={s.issueTitle}>{issue.title}</span>
                          </span>
                          <span style={s.bandDetail}>{issue.accomplishes}</span>
                        </Stack>
                      </div>
                    );
                  })}
                </Stack>
              </section>
            ))}
          </Stack>
        ))}
      </Stack>
    </Page>
  );
}

const s = {
  // hds.typeStyles.eyebrow rather than a hand-rolled fontSize + letterSpacing:
  // bypassing the token is exactly what hds#283 is about.
  eyebrow: {
    ...hds.typeStyles.eyebrow,
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  auditTitle: {
    ...hds.typeStyles.h2,
    margin: 0,
    color: 'var(--semantic-color-content-primary)',
  } as CSSProperties,
  verdict: {
    ...hds.typeStyles.body,
    margin: 0,
    maxWidth: '68ch',
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  sectionHeading: {
    ...hds.typeStyles.h3,
    margin: 0,
    color: 'var(--semantic-color-content-primary)',
  } as CSSProperties,
  asOf: {
    ...hds.typeStyles.caption,
    margin: `${hds.space.px4} 0 0`,
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  themeSummary: {
    ...hds.typeStyles.ui,
    margin: `${hds.space.px4} 0 0`,
    maxWidth: '68ch',
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  // Open bands separated by a divider, not repeated outlined cards — the
  // roadmap/status rule in the design system's CLAUDE.md.
  band: {
    display: 'flex',
    gap: hds.space.px12,
    alignItems: 'flex-start',
    padding: `${hds.space.px12} 0`,
    borderTop: '1px solid var(--semantic-color-border-default)',
  } as CSSProperties,
  dot: {
    width: hds.space.px8,
    height: hds.space.px8,
    borderRadius: '50%',
    marginTop: hds.space.px8,
    flexShrink: 0,
  } as CSSProperties,
  bandLabel: {
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-primary)',
  } as CSSProperties,
  bandDetail: {
    ...hds.typeStyles.ui,
    maxWidth: '72ch',
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  issueHead: {
    display: 'flex',
    gap: hds.space.px8,
    flexWrap: 'wrap',
    alignItems: 'baseline',
  } as CSSProperties,
  ref: {
    ...hds.typeStyles.monoSm,
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  issueTitle: {
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-primary)',
  } as CSSProperties,
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
  } as CSSProperties,
};
