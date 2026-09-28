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

import { Divider, Page, Stack, StatusDot, Text, VisuallyHidden } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';

import { PageHeader } from '../PageHeader';
import auditData from '../../../../../docs/ai/fleet-audit.json';

type HealthState = 'green' | 'risk' | 'red';

interface HealthRow {
  name: string;
  /** Narrowed at the import boundary below — JSON gives us `string`, and a cast
   *  at every use site is how an unreviewed sixth state reaches the UI silently. */
  state: HealthState;
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

/**
 * A theme name is prose ("Broken right now") and an `id` must survive being read
 * back as a space-separated token list — `aria-labelledby` splits on whitespace,
 * so an unslugged name silently points at three ids that do not exist and the
 * heading association dies without any visible symptom.
 */
function slugId(prefix: string, value: string): string {
  return `${prefix}-${value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;
}

/** `hds#284` → the issue URL. One place, so a typo cannot produce a plausible dead link. */
function issueUrl(ref: string): string | null {
  const m = /^([a-z-]+)#(\d+)$/.exec(ref.trim());
  return m ? `https://github.com/hirobius/${m[1]}/issues/${m[2]}` : null;
}

type DotTone = 'success' | 'warning' | 'danger' | 'neutral';
const STATE_TONE: Record<HealthState, DotTone> = {
  green: 'success',
  risk: 'warning',
  red: 'danger',
};

function stateTone(state: HealthState): DotTone {
  // The `??` is not dead code: the cast at the import boundary is a promise TS
  // cannot keep, so an unknown state must degrade to neutral rather than undefined.
  return STATE_TONE[state] ?? 'neutral';
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
              <Text variant="eyebrow" as="span" style={s.secondary}>
                {audit.date}
              </Text>
              <Text variant="heading2" style={s.primary}>
                {audit.title}
              </Text>
              <Text variant="body" style={{ ...s.secondary, maxWidth: '68ch' }}>
                {audit.verdict}
              </Text>
            </Stack>

            <section aria-labelledby={`health-${audit.date}`}>
              <Text variant="heading3" id={`health-${audit.date}`} style={s.primary}>
                Build health
              </Text>
              <Text variant="caption" style={{ ...s.secondary, marginTop: hds.space.px4 }}>
                Measured {audit.date}. Not live — re-run to refresh.
              </Text>
              <Stack direction="column" gap="px2" style={{ marginTop: hds.space.px12 }}>
                {audit.buildHealth.map((row) => (
                  <div key={row.name}>
                    <Divider />
                    <div style={s.band}>
                      <StatusDot tone={stateTone(row.state)} style={s.dot} />
                      <Stack direction="column" gap="px2" style={{ minWidth: 0 }}>
                        <span style={s.bandLabel}>
                          {row.name}
                          <VisuallyHidden>{` — ${row.state}`}</VisuallyHidden>
                        </span>
                        <Text variant="ui" as="span" style={s.bandDetail}>
                          {row.detail}
                        </Text>
                      </Stack>
                    </div>
                  </div>
                ))}
              </Stack>
            </section>

            {audit.themes.map((theme) => (
              <section key={theme.name} aria-labelledby={slugId(`t-${audit.date}`, theme.name)}>
                <Text
                  variant="heading3"
                  id={slugId(`t-${audit.date}`, theme.name)}
                  style={s.primary}
                >
                  {theme.name}
                </Text>
                <Text
                  variant="ui"
                  style={{ ...s.secondary, marginTop: hds.space.px4, maxWidth: '68ch' }}
                >
                  {theme.summary}
                </Text>
                <Stack direction="column" gap="px2" style={{ marginTop: hds.space.px12 }}>
                  {theme.issues.map((issue) => {
                    const href = issueUrl(issue.ref);
                    return (
                      <div key={issue.ref}>
                        <Divider />
                        <div style={s.band}>
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
                            <Text variant="ui" as="span" style={s.bandDetail}>
                              {issue.accomplishes}
                            </Text>
                          </Stack>
                        </div>
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
  // Type comes from <Text variant>, whose classes read the same
  // --semantic-typography-* vars as hds.typeStyles; only colour is set here.
  primary: { color: 'var(--semantic-color-content-primary)' } as CSSProperties,
  secondary: { color: 'var(--semantic-color-content-secondary)' } as CSSProperties,
  // Open bands separated by a <Divider/>, not repeated outlined cards — the
  // roadmap/status rule in the design system's CLAUDE.md.
  band: {
    display: 'flex',
    gap: hds.space.px12,
    alignItems: 'flex-start',
    padding: `${hds.space.px12} 0`,
  } as CSSProperties,
  // StatusDot's md size is the same 8px; only the optical offset to the label's
  // first line is local.
  dot: { marginTop: hds.space.px8 } as CSSProperties,
  bandLabel: {
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-primary)',
  } as CSSProperties,
  bandDetail: {
    display: 'block',
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
};
