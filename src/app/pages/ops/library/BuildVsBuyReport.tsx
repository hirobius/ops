/* hds-bypass: ops-internal page. HDS Table has no aria-sort on its headers yet — sort state is announced via each header button's label. */

/**
 * BuildVsBuyReport — the 2026-09-25 build-vs-buy audit, native on HDS.
 * A dated snapshot: sizes, churn and prices are as measured that day.
 *
 * Data: docs/ai/build-vs-buy.json.
 *
 * @category Internal
 * @tier utility
 */

import { useMemo, useState } from 'react';

import { Badge, Stack, Table, Tag } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';

import { buildVsBuy, sortSystems, type SortDir, type SortKey, type Verdict } from './libraryData';
import { s } from './styles';

type BadgeTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'inProgress';

const VERDICT_TONE: Record<Verdict, BadgeTone> = {
  REPLACE: 'danger',
  WRAP: 'warning',
  KEEP: 'success',
};

const COLUMNS: { key: SortKey; label: string; width: string }[] = [
  { key: 'name', label: 'System', width: '22%' },
  { key: 'repo', label: 'Repo', width: '9%' },
  { key: 'lines', label: 'Size', width: '11%' },
  { key: 'verdict', label: 'Verdict', width: '9%' },
  { key: 'cost', label: 'Cost', width: '12%' },
  { key: 'effort', label: 'Effort', width: '7%' },
  { key: 'payoff', label: 'Payoff', width: '10%' },
];

const FILTERS: (Verdict | 'ALL')[] = ['ALL', 'REPLACE', 'WRAP', 'KEEP'];
const fmt = (n: number) => n.toLocaleString('en-US');

/** @public */
export default function BuildVsBuyReport() {
  const [sortKey, setSortKey] = useState<SortKey>('payoff');
  const [dir, setDir] = useState<SortDir>('desc');
  const [filter, setFilter] = useState<Verdict | 'ALL'>('ALL');

  const byId = useMemo(() => new Map(buildVsBuy.systems.map((x) => [x.id, x])), []);
  const rows = useMemo(
    () =>
      sortSystems(
        buildVsBuy.systems.filter((x) => filter === 'ALL' || x.verdict === filter),
        sortKey,
        dir,
      ),
    [filter, sortKey, dir],
  );
  const keepers = buildVsBuy.systems.filter((x) => x.verdict === 'KEEP');
  const tally = (v: Verdict) => buildVsBuy.systems.filter((x) => x.verdict === v).length;

  function onSort(key: SortKey) {
    if (key === sortKey) setDir(dir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setDir(key === 'payoff' || key === 'lines' ? 'desc' : 'asc');
    }
  }

  return (
    <Stack direction="column" gap="px40">
      <Stack direction="column" gap="px8">
        <span style={s.eyebrow}>{buildVsBuy.date} · research snapshot, not live</span>
        <p style={s.lede}>{buildVsBuy.verdict}</p>
        <p style={s.caption}>
          {tally('REPLACE')} replace · {tally('WRAP')} wrap · {tally('KEEP')} keep ·{' '}
          <a href={buildVsBuy.artifact} className="hds-focus" style={s.link}>
            original artifact
          </a>
        </p>
      </Stack>

      <section aria-labelledby="bvb-top">
        <h2 id="bvb-top" style={s.h2}>
          Top 5 to do first
        </h2>
        <Stack direction="column" gap="px2" style={{ marginTop: hds.space.px12 }}>
          {buildVsBuy.topFive.map((t, i) => {
            const sys = byId.get(t.systemId);
            return (
              <div key={t.systemId} style={s.band}>
                <span style={s.rank}>{i + 1}</span>
                <Stack direction="column" gap="px4" style={{ minWidth: 0 }}>
                  <span style={s.bandHead}>
                    <span style={s.bandTitle}>{t.title}</span>
                    {sys ? <Badge tone={VERDICT_TONE[sys.verdict]}>{sys.verdict}</Badge> : null}
                  </span>
                  <span style={s.body}>{t.body}</span>
                  {sys ? (
                    <span style={s.mono}>
                      {sys.cost} · effort {sys.effort ?? '—'} · {sys.payoffNote}
                    </span>
                  ) : null}
                </Stack>
              </div>
            );
          })}
        </Stack>
      </section>

      <section aria-labelledby="bvb-all">
        <Stack direction="column" gap="px12">
          <h2 id="bvb-all" style={s.h2}>
            Every system
          </h2>
          <p style={s.body}>
            Size is files / lines, then commits in the 90 days before the audit. Payoff (0–100)
            blends hours saved, upkeep removed, risk cut and client impact — an estimate.
          </p>
          <div role="group" aria-label="Filter by verdict" style={s.bandHead}>
            {FILTERS.map((f) => (
              <Tag key={f} active={filter === f} onClick={() => setFilter(f)}>
                {f === 'ALL' ? 'All' : f[0] + f.slice(1).toLowerCase()}
              </Tag>
            ))}
            <span style={s.caption}>
              {rows.length} of {buildVsBuy.systems.length}
            </span>
          </div>
          <Table
            minWidth={960}
            density="compact"
            stickyHeader
            columns={[
              ...COLUMNS.map((c) => ({
                key: c.key,
                width: c.width,
                label: (
                  <button
                    type="button"
                    className="hds-focus"
                    style={s.thButton}
                    onClick={() => onSort(c.key)}
                    aria-label={`Sort by ${c.label}${
                      c.key === sortKey ? (dir === 'asc' ? ', ascending' : ', descending') : ''
                    }`}
                  >
                    {c.label}
                    {c.key === sortKey ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                ),
              })),
              { key: 'alt', label: 'Best alternative', width: '20%' },
            ]}
            // Cells are positional: their order must match `columns` above
            // (COLUMNS, then the alternative). Reorder both together.
            rows={rows.map((x) => ({
              key: x.id,
              cells: [
                {
                  slot: 'custom',
                  content: (
                    <span>
                      <strong>{x.name}</strong>
                      <span style={s.sub}>{x.why}</span>
                    </span>
                  ),
                },
                { slot: 'value', content: x.repo },
                {
                  slot: 'custom',
                  content: (
                    <span style={s.tdNum}>
                      {x.files || x.lines ? `${fmt(x.files)} / ${fmt(x.lines)}` : 'none built'}
                      <span style={s.sub}>{x.commits90d} commits · 90d</span>
                    </span>
                  ),
                },
                {
                  slot: 'badge',
                  content: <Badge tone={VERDICT_TONE[x.verdict]}>{x.verdict}</Badge>,
                },
                { slot: 'value', content: x.cost },
                { slot: 'code', content: x.effort ?? '—' },
                {
                  slot: 'custom',
                  content: (
                    <span>
                      <span style={s.tdNum}>{x.payoff}</span>
                      <span style={s.sub}>{x.payoffNote}</span>
                    </span>
                  ),
                },
                {
                  slot: 'custom',
                  content: (
                    <span>
                      {x.alternative}
                      {x.alsoConsider ? <span style={s.sub}>Also: {x.alsoConsider}</span> : null}
                    </span>
                  ),
                },
              ],
            }))}
          />
        </Stack>
      </section>

      <section aria-labelledby="bvb-keep">
        <h2 id="bvb-keep" style={s.h2}>
          Keep, don&apos;t touch
        </h2>
        <p style={{ ...s.body, marginTop: hds.space.px4 }}>
          The edge, or already on the right vendor, or cheaper than any tool.
        </p>
        <Stack direction="column" gap="px2" style={{ marginTop: hds.space.px12 }}>
          {keepers.map((x) => (
            <div key={x.id} style={s.band}>
              <Stack direction="column" gap="px2" style={{ minWidth: 0 }}>
                <span style={s.bandHead}>
                  <span style={s.bandTitle}>{x.name}</span>
                  <span style={s.mono}>{x.repo}</span>
                </span>
                <span style={s.body}>
                  {x.payoffNote}. {x.why}
                </span>
              </Stack>
            </div>
          ))}
        </Stack>
      </section>

      <section aria-labelledby="bvb-tools">
        <h2 id="bvb-tools" style={s.h2}>
          Business tools to add
        </h2>
        <p style={{ ...s.body, marginTop: hds.space.px4 }}>
          Prefer tools with an official MCP server, so agents can use them without glue code.
        </p>
        <Stack direction="column" gap="px2" style={{ marginTop: hds.space.px12 }}>
          {buildVsBuy.businessTools.map((t) => (
            <div key={t.need} style={s.band}>
              <Stack direction="column" gap="px2" style={{ minWidth: 0 }}>
                <span style={s.bandHead}>
                  <span style={s.mono}>{t.need}</span>
                  <span style={s.bandTitle}>{t.pick}</span>
                </span>
                <span style={s.body}>{t.why}</span>
              </Stack>
            </div>
          ))}
        </Stack>
      </section>

      <section aria-labelledby="bvb-notes">
        <h3 id="bvb-notes" style={s.h3}>
          How this was made
        </h3>
        <ul style={{ ...s.body, paddingLeft: hds.space.px20, marginTop: hds.space.px8 }}>
          {buildVsBuy.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </section>
    </Stack>
  );
}
