/* hds-bypass: ops-internal page. Inline styles intentional for ops dashboard. */

/**
 * LeadSweepPanel — saved niche×metro sweep selector for the Leads board (#12).
 *
 * SPEND-SAFE BY DESIGN (Outscraper spend is ON HOLD — standing rule, Adrian
 * 2026-07-07). Picking a preset only expands + previews pairs; nothing calls
 * the network until "Run selected" → an explicit confirm step. Flow:
 *
 *   1. Pick a preset → expands to niche×metro pairs (scripts/lib/query-
 *      presets.mjs via sweepPresets.ts — one source of truth, see that file).
 *      A bounded, evenly-spread SAMPLE is pre-checked (never all ~100+ pairs).
 *   2. Reviewable checklist — de-select any pair. Running record estimate
 *      (`selected pairs × count`) shown live against the configurable cap and
 *      the 500/mo free tier.
 *   3. Over the cap → "Run selected" is disabled with a warning. Under cap →
 *      it opens an explicit confirm step (pair count + record estimate)
 *      before anything fires.
 *   4. Confirmed run POSTs /api/pull-leads sequentially, one {niche, metro,
 *      count} per pair (mirrors PullLeadsForm's single-pair call), with a
 *      visible progress bar and a Stop control between calls.
 */

import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { Stack, Badge, Button, Callout, HdsCheckbox, Progress } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { opsApi } from '../../../lib/opsApi';
import {
  PRESETS,
  PRESET_NAMES,
  expandPresetPairs,
  estimateRecords,
  sampleBounded,
  pairKey,
  type SweepPair,
} from './sweepPresets';

const MONTHLY_FREE_TIER = 500;
const DEFAULT_CAP = 120;
const DEFAULT_COUNT_PER_PAIR = 5;

type RunState =
  | { kind: 'idle' }
  | { kind: 'confirming' }
  | { kind: 'running'; done: number; total: number }
  | { kind: 'done'; inserted: number; pairsRun: number; stopped: boolean }
  | { kind: 'error'; message: string };

export interface LeadSweepPanelProps {
  onInserted?: (inserted: number) => void;
}

export function LeadSweepPanel({ onInserted }: LeadSweepPanelProps) {
  const [presetKey, setPresetKey] = useState('');
  const [countPerPair, setCountPerPair] = useState(DEFAULT_COUNT_PER_PAIR);
  const [cap, setCap] = useState(DEFAULT_CAP);
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set());
  const [run, setRun] = useState<RunState>({ kind: 'idle' });
  const stopRef = useRef(false);

  const preset = presetKey ? PRESETS[presetKey] : undefined;
  const pairs = useMemo(() => (presetKey ? expandPresetPairs(presetKey) : []), [presetKey]);
  const running = run.kind === 'running';

  const estimate = estimateRecords(selectedKeys.size, countPerPair);
  const overCap = estimate > cap;
  const canRun = !running && selectedKeys.size > 0 && !overCap;

  function applySample(nextPairs: SweepPair[], nextCap: number, nextCount: number) {
    setSelectedKeys(new Set(sampleBounded(nextPairs, nextCap, nextCount).map(pairKey)));
  }

  function handlePresetChange(nextKey: string) {
    setPresetKey(nextKey);
    setRun({ kind: 'idle' });
    const nextPairs = nextKey ? expandPresetPairs(nextKey) : [];
    applySample(nextPairs, cap, countPerPair);
  }

  function togglePair(key: string) {
    if (running) return;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    setSelectedKeys(new Set(pairs.map(pairKey)));
  }

  function clearAll() {
    setSelectedKeys(new Set());
  }

  function resetToSample() {
    applySample(pairs, cap, countPerPair);
  }

  function requestRun() {
    if (!canRun) return;
    setRun({ kind: 'confirming' });
  }

  async function confirmRun() {
    const toRun = pairs.filter((p) => selectedKeys.has(pairKey(p)));
    if (toRun.length === 0) return;
    stopRef.current = false;
    setRun({ kind: 'running', done: 0, total: toRun.length });
    let totalInserted = 0;
    let ranCount = 0;
    for (const pair of toRun) {
      if (stopRef.current) break;
      try {
        const response = await opsApi.post('/api/pull-leads', {
          niche: pair.niche,
          metro: pair.metro,
          count: countPerPair,
        });
        const data = (await response.json().catch(() => ({}))) as { inserted?: number };
        if (response.ok && typeof data.inserted === 'number') totalInserted += data.inserted;
      } catch {
        // one pair failing shouldn't halt the rest of the sweep — surfaced via the board on refetch
      }
      ranCount += 1;
      setRun({ kind: 'running', done: ranCount, total: toRun.length });
    }
    setRun({ kind: 'done', inserted: totalInserted, pairsRun: ranCount, stopped: stopRef.current });
    onInserted?.(totalInserted);
  }

  function stopRun() {
    stopRef.current = true;
  }

  return (
    <section style={panelStyle} aria-label="Saved lead sweeps">
      <Stack direction="column" gap="gap">
        <Stack direction="row" gap="gap" align="end" wrap="wrap">
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>Saved sweep</span>
            <select
              value={presetKey}
              onChange={(e) => handlePresetChange(e.target.value)}
              disabled={running}
              style={selectStyle}
            >
              <option value="">Choose a preset…</option>
              {PRESET_NAMES.map((name) => (
                <option key={name} value={name}>
                  {PRESETS[name].label}
                </option>
              ))}
            </select>
          </label>
          <label style={countFieldStyle}>
            <span style={fieldLabelStyle}>Count / pair</span>
            <input
              type="number"
              min={1}
              max={50}
              value={countPerPair}
              onChange={(e) =>
                setCountPerPair(clamp(e.target.value, 1, 50, DEFAULT_COUNT_PER_PAIR))
              }
              disabled={running}
              style={countInputStyle}
            />
          </label>
          <label style={countFieldStyle}>
            <span style={fieldLabelStyle}>Cap / run</span>
            <input
              type="number"
              min={1}
              max={MONTHLY_FREE_TIER}
              value={cap}
              onChange={(e) => setCap(clamp(e.target.value, 1, MONTHLY_FREE_TIER, DEFAULT_CAP))}
              disabled={running}
              style={countInputStyle}
            />
          </label>
        </Stack>

        {preset && (
          <>
            <div style={checklistBoxStyle}>
              {preset.metros.map((metro) => (
                <div key={metro.region} style={regionBlockStyle}>
                  <div style={regionHeaderStyle}>{metro.region}</div>
                  {metro.areas.map((area) => (
                    <Stack key={area} direction="row" gap="gap" align="center" wrap="wrap">
                      <span style={areaLabelStyle}>{area}</span>
                      {preset.keywords.map((keyword) => {
                        const key = pairKey({ niche: keyword, metro: area });
                        return (
                          <HdsCheckbox
                            key={key}
                            label={keyword}
                            checked={selectedKeys.has(key)}
                            onChange={() => togglePair(key)}
                            disabled={running}
                          />
                        );
                      })}
                    </Stack>
                  ))}
                </div>
              ))}
            </div>

            <Stack direction="row" gap="gap" align="center" wrap="wrap" justify="space-between">
              <Stack direction="row" gap="gap" align="center" wrap="wrap">
                <Button size="sm" variant="secondary" onClick={selectAll} disabled={running}>
                  Select all ({pairs.length})
                </Button>
                <Button size="sm" variant="secondary" onClick={clearAll} disabled={running}>
                  Clear
                </Button>
                <Button size="sm" variant="secondary" onClick={resetToSample} disabled={running}>
                  Reset to suggested sample
                </Button>
              </Stack>
              <span style={estimateTextStyle}>
                {selectedKeys.size} of {pairs.length} pairs selected · ~{estimate} of{' '}
                {MONTHLY_FREE_TIER} monthly free tier
                {overCap ? ` · over the ${cap}/run cap` : ''}
              </span>
            </Stack>

            {overCap && (
              <Callout tone="danger">
                Estimate (~{estimate} records) exceeds the {cap}/run cap. Deselect pairs, lower the
                count/pair, or raise the cap before running.
              </Callout>
            )}

            {run.kind === 'confirming' && (
              <Callout tone="warning">
                <Stack direction="column" gap="gap">
                  <span>
                    Confirm: run {selectedKeys.size} pair{selectedKeys.size === 1 ? '' : 's'}{' '}
                    sequentially through /api/pull-leads → ~{estimate} records total. Nothing has
                    fired yet.
                  </span>
                  <Stack direction="row" gap="gap">
                    <Button size="sm" variant="primary" tone="warning" onClick={confirmRun}>
                      Confirm run
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setRun({ kind: 'idle' })}>
                      Cancel
                    </Button>
                  </Stack>
                </Stack>
              </Callout>
            )}

            {run.kind !== 'confirming' && (
              <Stack direction="row" gap="gap" align="center" wrap="wrap">
                <Button variant="primary" onClick={requestRun} disabled={!canRun}>
                  Run selected
                </Button>
                {running && (
                  <Button size="sm" variant="secondary" tone="danger" onClick={stopRun}>
                    Stop
                  </Button>
                )}
              </Stack>
            )}

            {run.kind === 'running' && (
              <Stack direction="column" gap="gap">
                <Progress
                  value={run.total > 0 ? (run.done / run.total) * 100 : 0}
                  label={`Running ${run.done} of ${run.total} pairs…`}
                />
              </Stack>
            )}

            {run.kind === 'done' && (
              <Stack direction="row" gap="gap" align="center" wrap="wrap">
                <Badge tone={run.stopped ? 'warning' : 'success'}>
                  {run.stopped ? 'Stopped' : 'Sourced'}
                </Badge>
                <span style={estimateTextStyle}>
                  {run.inserted} lead{run.inserted === 1 ? '' : 's'} upserted across {run.pairsRun}{' '}
                  pair
                  {run.pairsRun === 1 ? '' : 's'}
                  {run.stopped ? ' (stopped early)' : ''}.
                </span>
              </Stack>
            )}
          </>
        )}
      </Stack>
    </section>
  );
}

function clamp(raw: string, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(Math.floor(n), max));
}

// ── Styles (mobile-first; tap targets ≥ 44px) ───────────────────────────────────

const panelStyle: CSSProperties = {
  border: '1px solid var(--semantic-color-border-default)',
  borderRadius: hds.borderRadius[8],
  padding: hds.semantic.space.component.gap,
  background: 'var(--semantic-color-surface-raised)',
  width: '100%',
};

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: hds.space.px4,
  flex: '1 1 16rem',
  minWidth: 0,
};

const countFieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: hds.space.px4,
  flex: '0 0 auto',
};

const fieldLabelStyle: CSSProperties = {
  ...hds.typeStyles.eyebrow,
  color: 'var(--semantic-color-content-secondary)',
};

const selectStyle: CSSProperties = {
  ...hds.typeStyles.ui,
  width: '100%',
  minHeight: '44px',
  padding: '8px 12px',
  border: '1px solid var(--semantic-color-border-default)',
  borderRadius: hds.borderRadius[8],
  background: 'transparent',
  color: 'var(--semantic-color-content-primary)',
  boxSizing: 'border-box',
};

const countInputStyle: CSSProperties = {
  ...hds.typeStyles.ui,
  width: '6rem',
  minHeight: '44px',
  padding: '8px 12px',
  border: '1px solid var(--semantic-color-border-default)',
  borderRadius: hds.borderRadius[8],
  background: 'transparent',
  color: 'var(--semantic-color-content-primary)',
  boxSizing: 'border-box',
};

const checklistBoxStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: hds.space.px16,
  maxHeight: '20rem',
  overflowY: 'auto',
  border: '1px solid var(--semantic-color-border-subdued)',
  borderRadius: hds.borderRadius[8],
  padding: hds.space.px12,
};

const regionBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: hds.space.px8,
};

const regionHeaderStyle: CSSProperties = {
  ...hds.typeStyles.eyebrow,
  color: 'var(--semantic-color-content-secondary)',
};

const areaLabelStyle: CSSProperties = {
  ...hds.typeStyles.ui,
  fontSize: hds.fontSize.xs,
  color: 'var(--semantic-color-content-primary)',
  flex: '0 0 9rem',
};

const estimateTextStyle: CSSProperties = {
  fontFamily: hds.monoFamily,
  fontSize: hds.fontSize.xs,
  color: 'var(--semantic-color-content-secondary)',
};
