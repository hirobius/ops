/* hds-bypass: ops-internal page */

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

import { Link } from 'react-router';

import { Badge, Callout, Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';

import { pipelineWalkthrough, type StageStatus } from './libraryData';
import { s } from './styles';

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
        <span style={s.eyebrow}>
          synced with {d.canonicalSource} · updated {d.updated}
        </span>
        <p style={s.lede}>{d.headline}</p>
        <p style={s.body}>{d.lede}</p>
      </Stack>

      <Callout tone="danger">
        <p style={{ ...s.body, color: 'inherit', margin: 0 }}>{d.thesis}</p>
      </Callout>

      <div role="group" aria-label="Stage tally" style={{ ...s.bandHead, flexWrap: 'wrap' }}>
        {d.tally.map((t) => (
          <Badge key={t.status} tone={STATUS_TONE[t.status]}>
            {t.count} {t.label}
          </Badge>
        ))}
      </div>

      <Callout tone="info">
        <p style={{ ...s.caption, color: 'inherit', margin: 0 }}>
          For the current, live verdict on any stage below, read{' '}
          <Link to="/ops/standing" className="hds-focus" style={{ color: 'inherit' }}>
            /ops/standing
          </Link>{' '}
          — it derives every status from live <code>leads</code> row counts, never from this page.
        </p>
      </Callout>

      <section aria-labelledby="pw-funnel">
        <h2 id="pw-funnel" style={s.h2}>
          The funnel
        </h2>
        <Stack direction="column" gap="px2" style={{ marginTop: hds.space.px12 }}>
          {d.stages.map((stage) => (
            <div key={stage.n}>
              <div style={s.band}>
                <span style={s.rank}>{stage.n}</span>
                <Stack direction="column" gap="px4" style={{ minWidth: 0, flex: 1 }}>
                  <span style={s.bandHead}>
                    <span style={s.bandTitle}>{stage.title}</span>
                    <Badge tone={STATUS_TONE[stage.status]}>{stage.statusLabel}</Badge>
                    {stage.extraStatus ? (
                      <Badge tone={STATUS_TONE[stage.extraStatus]}>{stage.extraStatusLabel}</Badge>
                    ) : null}
                  </span>
                  <span style={s.body}>{stage.description}</span>
                  <span style={{ ...s.bandHead, marginTop: hds.space.px4 }}>
                    {stage.chips.map((chip) => (
                      <span key={chip} style={s.mono}>
                        {chip}
                      </span>
                    ))}
                  </span>
                </Stack>
              </div>
              {stage.brokenMiddleAfter ? (
                <p
                  style={{ ...s.caption, color: 'var(--semantic-color-content-danger)', margin: 0 }}
                >
                  ↑ the broken middle
                </p>
              ) : null}
            </div>
          ))}
        </Stack>
      </section>

      <section aria-labelledby="pw-command-center">
        <h2 id="pw-command-center" style={s.h2}>
          {d.commandCenter.title}
        </h2>
        <Callout tone="success">
          <span style={s.bandHead}>
            <strong style={{ ...s.body, color: 'inherit' }}>{d.commandCenter.heading}</strong>
            <Badge tone={STATUS_TONE[d.commandCenter.status]}>{d.commandCenter.status}</Badge>
          </span>
          <p style={{ ...s.body, color: 'inherit', marginTop: hds.space.px8, marginBottom: 0 }}>
            {d.commandCenter.description}
          </p>
          <span style={{ ...s.bandHead, marginTop: hds.space.px12 }}>
            {d.commandCenter.chips.map((chip) => (
              <span key={chip} style={s.mono}>
                {chip}
              </span>
            ))}
          </span>
          <p style={{ ...s.body, color: 'inherit', marginTop: hds.space.px12, marginBottom: 0 }}>
            {d.commandCenter.openNote}
          </p>
        </Callout>
      </section>

      <footer
        style={{
          borderTop: '1px solid var(--semantic-color-border-default)',
          paddingTop: hds.space.px16,
        }}
      >
        <p style={s.caption}>{d.footer}</p>
      </footer>
    </Stack>
  );
}
