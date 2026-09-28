/**
 * PipelineWalkthroughReport — the delivery-pipeline gap-map, native on HDS.
 * Visual companion to docs/ARCHITECTURE.md (CLAUDE.md §1 keeps the two in
 * lockstep) — the narrative, not live status. For whether a stage actually
 * works today, this page links to /ops/standing rather than hand-writing it.
 *
 * Data: docs/ai/pipeline-walkthrough.json.
 *
 * @category Internal
 * @tier utility
 */

import { type CSSProperties } from 'react';
import { Link } from 'react-router';

import { Badge, Callout, Divider, Stack, Text } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';

import { pipelineWalkthrough, type StageStatus } from './libraryData';

type BadgeTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'inProgress';

const STATUS_TONE: Record<StageStatus, BadgeTone> = {
  live: 'success',
  gated: 'warning',
  scaffold: 'info',
  gap: 'danger',
  future: 'neutral',
};

/** @public */
export default function PipelineWalkthroughReport() {
  const d = pipelineWalkthrough;
  return (
    <Stack direction="column" gap="px40">
      <Stack direction="column" gap="px8">
        <Text variant="eyebrow" as="span" style={c.secondary}>
          synced with {d.canonicalSource} · updated {d.updated}
        </Text>
        <Text variant="body" style={{ ...c.secondary, maxWidth: '68ch' }}>
          {d.headline}
        </Text>
        <Text variant="ui" style={c.body}>
          {d.lede}
        </Text>
      </Stack>

      <Callout tone="danger">
        <Text variant="ui" style={c.bodyInherit}>
          {d.thesis}
        </Text>
      </Callout>

      <div role="group" aria-label="Stage tally">
        <Stack direction="row" gap="px8" wrap="wrap" style={c.baseline}>
          {d.tally.map((t) => (
            <Badge key={t.status} tone={STATUS_TONE[t.status]}>
              {t.count} {t.label}
            </Badge>
          ))}
        </Stack>
      </div>

      <Callout tone="info">
        <Text variant="caption" style={c.inherit}>
          For the current, live verdict on any stage below, read{' '}
          <Link to="/ops/standing" className="hds-focus" style={c.inherit}>
            /ops/standing
          </Link>{' '}
          — it derives every status from live <code>leads</code> row counts, never from this page.
        </Text>
      </Callout>

      <section aria-labelledby="pw-funnel">
        <Text variant="heading2" id="pw-funnel" style={c.primary}>
          The funnel
        </Text>
        <Stack direction="column" gap="px2" style={{ marginTop: hds.space.px12 }}>
          {d.stages.map((stage) => (
            <div key={stage.n}>
              <Divider />
              <Stack direction="row" gap="px12" align="start" style={c.band}>
                <Text variant="heading3" as="span" style={c.rank}>
                  {stage.n}
                </Text>
                <Stack direction="column" gap="px4" style={{ minWidth: 0, flex: 1 }}>
                  <Stack as="span" direction="row" gap="px8" wrap="wrap" style={c.baseline}>
                    <Text variant="body" as="span" style={c.bandTitle}>
                      {stage.title}
                    </Text>
                    <Badge tone={STATUS_TONE[stage.status]}>{stage.statusLabel}</Badge>
                    {stage.extraStatus ? (
                      <Badge tone={STATUS_TONE[stage.extraStatus]}>{stage.extraStatusLabel}</Badge>
                    ) : null}
                  </Stack>
                  <Text variant="ui" as="span" style={c.body}>
                    {stage.description}
                  </Text>
                  <Stack
                    as="span"
                    direction="row"
                    gap="px8"
                    wrap="wrap"
                    style={{ ...c.baseline, marginTop: hds.space.px4 }}
                  >
                    {stage.chips.map((chip) => (
                      <Text key={chip} variant="technical" as="span" style={c.secondary}>
                        {chip}
                      </Text>
                    ))}
                  </Stack>
                </Stack>
              </Stack>
              {stage.brokenMiddleAfter ? (
                <Text variant="caption" style={c.danger}>
                  ↑ the broken middle
                </Text>
              ) : null}
            </div>
          ))}
        </Stack>
      </section>

      <section aria-labelledby="pw-command-center">
        <Text variant="heading2" id="pw-command-center" style={c.primary}>
          {d.commandCenter.title}
        </Text>
        <Callout tone="success">
          <Stack as="span" direction="row" gap="px8" wrap="wrap" style={c.baseline}>
            <Text variant="ui" as="strong" style={c.bodyInherit}>
              {d.commandCenter.heading}
            </Text>
            <Badge tone={STATUS_TONE[d.commandCenter.status]}>{d.commandCenter.status}</Badge>
          </Stack>
          <Text variant="ui" style={{ ...c.bodyInherit, marginTop: hds.space.px8 }}>
            {d.commandCenter.description}
          </Text>
          <Stack
            as="span"
            direction="row"
            gap="px8"
            wrap="wrap"
            style={{ ...c.baseline, marginTop: hds.space.px12 }}
          >
            {d.commandCenter.chips.map((chip) => (
              <Text key={chip} variant="technical" as="span" style={c.secondary}>
                {chip}
              </Text>
            ))}
          </Stack>
          <Text variant="ui" style={{ ...c.bodyInherit, marginTop: hds.space.px12 }}>
            {d.commandCenter.openNote}
          </Text>
        </Callout>
      </section>

      <Stack as="footer" direction="column" gap="px16">
        <Divider />
        <Text variant="caption" style={c.secondary}>
          {d.footer}
        </Text>
      </Stack>
    </Stack>
  );
}

// Type comes from <Text variant>, whose classes read the same
// --semantic-typography-* vars as hds.typeStyles; only colour, the local
// measure and the band geometry are set here.
const c = {
  primary: { color: 'var(--semantic-color-content-primary)' } as CSSProperties,
  secondary: { color: 'var(--semantic-color-content-secondary)' } as CSSProperties,
  danger: { color: 'var(--semantic-color-content-danger)' } as CSSProperties,
  inherit: { color: 'inherit' } as CSSProperties,
  body: { color: 'var(--semantic-color-content-secondary)', maxWidth: '72ch' } as CSSProperties,
  bodyInherit: { color: 'inherit', maxWidth: '72ch' } as CSSProperties,
  baseline: { alignItems: 'baseline' } as CSSProperties,
  // Open bands separated by a <Divider/>, not repeated outlined cards — the
  // roadmap/status rule in the design system's CLAUDE.md.
  band: { padding: `${hds.space.px16} 0` } as CSSProperties,
  bandTitle: {
    fontWeight: hds.fontWeight.bold,
    color: 'var(--semantic-color-content-primary)',
  } as CSSProperties,
  rank: {
    fontFamily: hds.monoFamily,
    color: 'var(--semantic-color-content-accent)',
    minWidth: hds.space.px32,
    flexShrink: 0,
  } as CSSProperties,
};
