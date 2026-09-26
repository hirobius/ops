/**
 * Sev1Banner — every open sev1 across the fleet, at the top of /ops/standing.
 *
 * ops#317: severity is orthogonal to priority. ops#27 (client PII in public git
 * history, with an unmet disclosure obligation) sat at p1 for 71 days as one
 * line among fifty, and nothing surfaced it. So a sev1 does not go in a lane —
 * it goes above all of them, and stays until the issue is closed — or accepted, which
 * has exactly one route: relabel it sev2 with a comment on the issue giving the reason.
 *
 * It renders nothing ONLY when a real fleet payload arrived with no sev1 in it.
 * A failed read (expired GITHUB_TOKEN → 502, unset → 503) leaves `data` null,
 * and an empty list from a read that never happened must not look like an
 * all-clear — so that state says UNKNOWN, loudly, at the top of the page. The
 * branch order mirrors StandingPage's <Lane>: token, then error, then loading.
 *
 * Same list as `pnpm sev1:check`, from the same definition
 * (`lib/tasks/severity.mjs`), so the page and the gate cannot disagree.
 */

import { useId } from 'react';
import type { CSSProperties } from 'react';
import { Badge, Callout, Text } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { shortRepo, type FleetIssue } from '../ralphStatus';
import { SEVERITY_LADDER } from '../../../../../lib/tasks/severity.mjs';

const SEV1_MEANS = SEVERITY_LADDER[0].means;

/** Server messages arrive with or without a closing period; the copy after needs one. */
function asSentence(text: string): string {
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

const NO_TOKEN =
  'GITHUB_TOKEN is not set on the server. Add it in Vercel → Settings → Environment Variables (Production + Preview), then redeploy.';

export function Sev1Banner({
  sev1,
  error,
  needsToken,
  loaded,
}: {
  sev1: readonly FleetIssue[];
  /** The fleet read's last error, if any. */
  error: string | null;
  /** The read failed because GITHUB_TOKEN is missing or unusable. */
  needsToken: boolean;
  /** True once a real fleet payload has arrived — not merely "a request finished". */
  loaded: boolean;
}) {
  const headingId = useId();

  if (needsToken || (error && !loaded)) {
    const reason = asSentence(error ?? NO_TOKEN);
    return (
      <section aria-labelledby={headingId}>
        <Callout tone="danger">
          <div style={s.body}>
            <div style={s.head}>
              <Text as="h2" id={headingId} variant="heading3" style={s.title}>
                Open sev1
              </Text>
              <Text as="span" variant="technical" style={s.count}>
                UNKNOWN
              </Text>
            </div>
            <Text as="p" variant="body" style={s.means}>
              Couldn’t read the fleet, so this is not an all-clear: {reason} Run{' '}
              <code style={s.code}>pnpm sev1:check</code> to list open sev1 from a terminal.
            </Text>
          </div>
        </Callout>
      </section>
    );
  }

  if (!loaded)
    return (
      <Text as="p" variant="caption" style={s.checking}>
        Checking for open sev1…
      </Text>
    );
  if (sev1.length === 0) return null;

  return (
    <section aria-labelledby={headingId}>
      <Callout tone="danger">
        <div style={s.body}>
          <div style={s.head}>
            <Text as="h2" id={headingId} variant="heading3" style={s.title}>
              Open sev1
            </Text>
            <Text as="span" variant="technical" style={s.count}>
              {sev1.length} open
            </Text>
          </div>
          <Text as="p" variant="body" style={s.means}>
            {SEV1_MEANS}. Stays at the top of this page until closed. The only way to accept one
            without closing it: relabel it sev2 with a comment on the issue giving the reason.
          </Text>
          <ul style={s.list}>
            {sev1.map((i) => (
              <li key={`${i.repo}#${i.number}`} style={s.row}>
                <a
                  href={i.url}
                  target="_blank"
                  rel="noreferrer"
                  className="hds-focus"
                  style={s.link}
                >
                  <Text as="span" variant="technical" style={s.num}>
                    #{i.number}
                  </Text>
                  <Text as="span" variant="body" style={s.issueTitle}>
                    {i.title}
                  </Text>
                </a>
                <div style={s.meta}>
                  <Badge tone="danger">sev1</Badge>
                  <Text as="span" variant="caption" style={s.repo}>
                    {shortRepo(i.repo)}
                    {i.prio ? ` · ${i.prio}` : ''}
                  </Text>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Callout>
    </section>
  );
}

const s = {
  body: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px8,
  },
  head: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: hds.space.px12,
  },
  title: {
    margin: 0,
    color: 'var(--semantic-color-content-primary)',
  },
  count: {
    color: 'var(--semantic-color-feedback-error)',
    whiteSpace: 'nowrap' as const,
  },
  means: {
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
    color: 'var(--semantic-color-content-accent)',
    flexShrink: 0,
  },
  issueTitle: {
    color: 'var(--semantic-color-content-primary)',
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: hds.space.px6,
  },
  repo: {
    color: 'var(--semantic-color-content-secondary)',
  },
  checking: {
    margin: 0,
    color: 'var(--semantic-color-content-tertiary)',
  },
  code: {
    ...hds.typeStyles.mono,
    padding: `0 ${hds.space.px4}`,
    borderRadius: hds.borderRadius.sm,
    background: 'var(--semantic-color-surface-base)',
  },
} satisfies Record<string, CSSProperties>;
