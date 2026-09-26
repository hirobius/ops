/* hds-bypass: ops-internal page */

/**
 * StateOfPlayReport — the 2026-09-19 state-of-play snapshot, native on HDS.
 * A dated snapshot: figures are as recorded that day. For whether a pipeline
 * stage actually works today, read /ops/standing, not this page.
 *
 * Data: docs/ai/state-of-play.json.
 *
 * @category Internal
 * @tier utility
 */

import { Link } from 'react-router';

import { Badge, Callout, Stack, Table } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';

import { stateOfPlay, type CommitmentStatus } from './libraryData';
import { s } from './styles';

type BadgeTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'inProgress';

const COMMITMENT_TONE: Record<CommitmentStatus, BadgeTone> = {
  done: 'success',
  part: 'warning',
  stop: 'danger',
};

const COMMITMENT_LABEL: Record<CommitmentStatus, string> = {
  done: 'Done',
  part: 'Partial',
  stop: 'Blocked',
};

/** @public */
export default function StateOfPlayReport() {
  const d = stateOfPlay;
  return (
    <Stack direction="column" gap="px40">
      <Stack direction="column" gap="px8">
        <span style={s.eyebrow}>{d.date} · snapshot, not live</span>
        <p style={s.lede}>{d.headline}</p>
        <p style={s.body}>{d.lede}</p>
      </Stack>

      <Callout tone="accent">
        <p style={{ ...s.body, color: 'inherit', margin: 0 }}>{d.northStar}</p>
        <p style={{ ...s.caption, color: 'inherit', marginTop: hds.space.px12, marginBottom: 0 }}>
          {d.scopeTest}
        </p>
      </Callout>

      <section aria-labelledby="sop-vitals">
        <h2 id="sop-vitals" style={s.h2}>
          Six rows are the whole story
        </h2>
        <Table
          minWidth={480}
          density="compact"
          columns={[
            { key: 'label', label: 'Vital sign', width: '60%' },
            { key: 'value', label: 'Value', width: '40%' },
          ]}
          rows={d.vitals.map((v, i) => ({
            key: String(i),
            cells: [
              { slot: 'value', content: v.label },
              {
                slot: 'custom',
                content: v.zero ? (
                  <Badge tone="danger">{v.value}</Badge>
                ) : (
                  <span style={s.tdNum}>{v.value}</span>
                ),
              },
            ],
          }))}
        />
        <p style={{ ...s.caption, marginTop: hds.space.px12 }}>{d.vitalsNote}</p>
      </section>

      <section aria-labelledby="sop-built">
        <h2 id="sop-built" style={s.h2}>
          The machine is in good shape
        </h2>
        <p style={s.body}>{d.builtAndWorking}</p>
      </section>

      <section aria-labelledby="sop-commitments">
        <h2 id="sop-commitments" style={s.h2}>
          Graded honestly
        </h2>
        <p style={s.body}>
          Numbered because the north star numbers them, and because 2 gates 3 — the order carries
          information.
        </p>
        <Stack direction="column" gap="px2" style={{ marginTop: hds.space.px12 }}>
          {d.commitments.map((c) => (
            <div key={c.n} style={s.band}>
              <span style={s.rank}>{c.n}</span>
              <Stack direction="column" gap="px4" style={{ minWidth: 0 }}>
                <span style={s.bandHead}>
                  <span style={s.bandTitle}>{c.title}</span>
                  <Badge tone={COMMITMENT_TONE[c.status]}>{COMMITMENT_LABEL[c.status]}</Badge>
                </span>
                <span style={s.body}>{c.verdict}</span>
              </Stack>
            </div>
          ))}
        </Stack>
      </section>

      <section aria-labelledby="sop-blockers">
        <h2 id="sop-blockers" style={s.h2}>
          One hour unblocks finished work
        </h2>
        <p style={s.body}>{d.blockersIntro}</p>
        <Callout tone="info">
          <p style={{ ...s.body, color: 'inherit', margin: 0 }}>{d.blockersCallout}</p>
        </Callout>
        <Table
          minWidth={640}
          density="compact"
          stickyHeader
          columns={[
            { key: 'set', label: 'Set this', width: '40%' },
            { key: 'unlocks', label: 'Unblocks', width: '45%' },
            { key: 'time', label: 'Time', width: '15%' },
          ]}
          rows={d.blockers.map((b, i) => ({
            key: String(i),
            cells: [
              {
                slot: 'custom',
                content: b.href ? (
                  <a href={b.href} className="hds-focus" style={s.link}>
                    {b.set}
                  </a>
                ) : (
                  <span>{b.set}</span>
                ),
              },
              { slot: 'value', content: b.unlocks },
              { slot: 'code', content: b.time },
            ],
          }))}
        />
      </section>

      <section aria-labelledby="sop-structural">
        <h2 id="sop-structural" style={s.h2}>
          Structural, not incidental
        </h2>

        <Stack direction="column" gap="px16">
          <div>
            <h3 style={s.h3}>{d.structural.triageTitle}</h3>
            <p style={{ ...s.body, marginTop: hds.space.px4 }}>{d.structural.triageBody}</p>
            <Table
              minWidth={480}
              density="compact"
              columns={[
                { key: 'bucket', label: 'Bucket', width: '40%' },
                { key: 'count', label: 'Count', width: '15%' },
                { key: 'meaning', label: 'What it means', width: '45%' },
              ]}
              rows={d.structural.triageBuckets.map((b) => ({
                key: b.bucket,
                cells: [
                  { slot: 'value', content: b.bucket },
                  { slot: 'code', content: String(b.count) },
                  { slot: 'value', content: b.meaning },
                ],
              }))}
            />
            <p style={{ ...s.caption, marginTop: hds.space.px12 }}>{d.structural.triageNote1}</p>
            <p style={{ ...s.caption, marginTop: hds.space.px8 }}>{d.structural.triageNote2}</p>
            <div style={{ marginTop: hds.space.px12 }}>
              <Table
                minWidth={480}
                density="compact"
                columns={[
                  { key: 'repo', label: 'Repo', width: '40%' },
                  { key: 'open', label: 'Open', width: '20%' },
                  { key: 'queued', label: 'Queued', width: '20%' },
                  { key: 'blocked', label: 'Blocked', width: '20%' },
                ]}
                rows={d.structural.repoRows.map((r) => ({
                  key: r.repo,
                  cells: [
                    { slot: 'value', content: r.total ? <strong>{r.repo}</strong> : r.repo },
                    { slot: 'code', content: String(r.open) },
                    { slot: 'code', content: String(r.queued) },
                    { slot: 'code', content: String(r.blocked) },
                  ],
                }))}
              />
            </div>
          </div>

          <Callout tone="danger">
            <h3 style={{ ...s.h3, color: 'inherit' }}>{d.structural.sev1Title}</h3>
            <p style={{ ...s.body, color: 'inherit', margin: 0 }}>{d.structural.sev1Body}</p>
          </Callout>
        </Stack>
      </section>

      <section aria-labelledby="sop-next">
        <h2 id="sop-next" style={s.h2}>
          What to do next
        </h2>
        <Stack direction="column" gap="px2">
          {d.nextSteps.map((step, i) => (
            <div key={i} style={s.band}>
              <span style={s.rank}>{i + 1}</span>
              <span style={s.body}>{step}</span>
            </div>
          ))}
        </Stack>
      </section>

      <section aria-labelledby="sop-handoff">
        <h2 id="sop-handoff" style={s.h2}>
          What an agent can finish unaided
        </h2>
        <p style={s.body}>{d.handoffIntro}</p>
        <Table
          minWidth={640}
          density="compact"
          stickyHeader
          columns={[
            { key: 'issue', label: 'Issue', width: '20%' },
            { key: 'what', label: 'What', width: '65%' },
            { key: 'size', label: 'Size', width: '15%' },
          ]}
          rows={d.handoff.map((h, i) => ({
            key: String(i),
            cells: [
              { slot: 'code', content: h.issue },
              { slot: 'value', content: h.what },
              { slot: 'code', content: h.size },
            ],
          }))}
        />
      </section>

      <section aria-labelledby="sop-decisions">
        <h2 id="sop-decisions" style={s.h2}>
          {d.decisionsTitle}
        </h2>
        <p style={s.body}>{d.decisionsIntro}</p>
        <Stack direction="column" gap="px2" style={{ marginTop: hds.space.px8 }}>
          {d.decisions.map((dec, i) => (
            <div key={i} style={s.band}>
              <span style={s.rank}>{i + 1}</span>
              <span style={s.body}>{dec}</span>
            </div>
          ))}
        </Stack>
        <div style={{ marginTop: hds.space.px16 }}>
          <Callout tone="info">
            <p style={{ ...s.body, color: 'inherit', margin: 0 }}>
              {d.decisionsFourth}{' '}
              <a href={d.decisionsFourthHref} className="hds-focus" style={s.link}>
                Repo settings
              </a>
              .
            </p>
          </Callout>
        </div>
      </section>

      <section aria-labelledby="sop-safety">
        <h2 id="sop-safety" style={s.h2}>
          {d.safetyTitle}
        </h2>
        <Stack direction="column" gap="px12">
          {d.safety.map((item, i) => (
            <p key={i} style={s.body}>
              {item}
            </p>
          ))}
        </Stack>
      </section>

      <footer
        style={{
          borderTop: '1px solid var(--semantic-color-border-default)',
          paddingTop: hds.space.px16,
        }}
      >
        <p style={s.caption}>{d.footer.note}</p>
        <p style={{ ...s.caption, marginTop: hds.space.px8 }}>{d.footer.source}</p>
        <p style={{ ...s.caption, marginTop: hds.space.px8 }}>{d.footer.sessionNote}</p>
        <p style={{ ...s.caption, marginTop: hds.space.px8 }}>
          For whether a pipeline stage works today, see{' '}
          <Link to="/ops/standing" className="hds-focus" style={s.link}>
            /ops/standing
          </Link>
          , not this page.
        </p>
      </footer>
    </Stack>
  );
}
