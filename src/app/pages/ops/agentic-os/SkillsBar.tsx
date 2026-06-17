/* hds-bypass: ops-internal page */

/**
 * SkillsBar — eight buttons that fire whitelisted scripts via the
 * `/api/skills/:id` dev endpoint. Each button cycles through
 * idle → running → success/error states with a result panel. JSON
 * skills (`list-eligible`, `audit-claims`) expand inline below the
 * button to show the parsed structure.
 */

import { useState, useCallback, useMemo, type ChangeEvent, type CSSProperties } from 'react';
import { Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import {
  runSkill,
  SKILLS,
  type SkillGroup,
  type SkillId,
  type SkillResponse,
  type SkillSpec,
} from './skills';

const GROUP_ORDER: readonly SkillGroup[] = ['Build', 'Ops', 'Sales', 'Client', 'Self', 'Knowledge'];

type ButtonState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'success'; response: SkillResponse }
  | { kind: 'error'; response: SkillResponse };

type RunState = Record<SkillId, ButtonState>;

function initialState(): RunState {
  const s: Partial<RunState> = {};
  for (const skill of SKILLS) s[skill.id] = { kind: 'idle' };
  return s as RunState;
}

export function SkillsBar() {
  const [runs, setRuns] = useState<RunState>(initialState);

  const handleRun = useCallback(async (id: SkillId, input?: string) => {
    setRuns((prev) => ({ ...prev, [id]: { kind: 'running' } }));
    const response = await runSkill(id, input);
    setRuns((prev) => ({ ...prev, [id]: { kind: response.ok ? 'success' : 'error', response } }));
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<SkillGroup, SkillSpec[]>();
    for (const g of GROUP_ORDER) map.set(g, []);
    for (const skill of SKILLS) map.get(skill.group)!.push(skill);
    return map;
  }, []);

  return (
    <Stack direction="column" gap="px16">
      {GROUP_ORDER.map((group) => {
        const skills = grouped.get(group) ?? [];
        if (skills.length === 0) return null;
        return (
          <Stack key={group} direction="column" gap="px8" style={{ minWidth: 0 }}>
            <Stack direction="row" align="center" gap="px8">
              <span style={s.groupLabel}>{group}</span>
              <span style={s.groupCount}>{skills.length}</span>
            </Stack>
            <div style={s.groupGrid}>
              {skills.map((skill) => (
                <SkillTile key={skill.id} skill={skill} state={runs[skill.id]} onRun={handleRun} />
              ))}
            </div>
          </Stack>
        );
      })}
    </Stack>
  );
}

interface TileProps {
  skill: SkillSpec;
  state: ButtonState;
  onRun: (id: SkillId, input?: string) => void;
}

export function SkillTile({ skill, state, onRun }: TileProps) {
  const indicator = stateIndicator(state);
  const showPanel = state.kind === 'success' || state.kind === 'error';
  const [inputValue, setInputValue] = useState('');

  const requiresInput = skill.input !== undefined;
  const inputEmpty = requiresInput && inputValue.length === 0;
  const isRunning = state.kind === 'running';

  return (
    <Stack direction="column" gap="px8" style={{ minWidth: 0 }}>
      {requiresInput && skill.input && (
        <InputControl
          input={skill.input}
          value={inputValue}
          onChange={setInputValue}
          disabled={isRunning}
        />
      )}
      <button
        type="button"
        onClick={() => onRun(skill.id, requiresInput ? inputValue : undefined)}
        disabled={isRunning || inputEmpty}
        aria-busy={isRunning}
        className="hds-focus"
        style={{ ...s.button, borderColor: indicator.borderColor }}
      >
        <span style={{ ...s.buttonIndicator, color: indicator.color }} aria-hidden="true">
          {indicator.symbol}
        </span>
        <span style={s.buttonLabel}>{skill.label}</span>
        <span style={s.buttonHint}>{skill.hint}</span>
      </button>
      {showPanel && <ResultPanel skill={skill} state={state} />}
    </Stack>
  );
}

function InputControl({
  input,
  value,
  onChange,
  disabled,
}: {
  input: NonNullable<SkillSpec['input']>;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
}) {
  const common = {
    'aria-label': input.label,
    placeholder: input.placeholder,
    disabled,
    style: s.input,
    className: 'hds-focus',
  } as const;

  if (input.kind === 'text') {
    return (
      <textarea
        {...common}
        value={value}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        rows={3}
      />
    );
  }
  if (input.kind === 'url') {
    return (
      <input
        type="url"
        {...common}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
    );
  }
  if (input.kind === 'slug') {
    return (
      <input
        type="text"
        {...common}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
    );
  }
  // file: pass the chosen file's name (not contents). Skill scripts that read
  // file contents should accept a path the skill-runner middleware can resolve.
  return (
    <input
      type="file"
      {...common}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        onChange(file ? file.name : '');
      }}
    />
  );
}

function ResultPanel({
  skill,
  state,
}: {
  skill: SkillSpec;
  state: Extract<ButtonState, { kind: 'success' | 'error' }>;
}) {
  const r = state.response;
  const failed = state.kind === 'error';

  return (
    <Stack
      direction="column"
      gap="px4"
      style={{
        ...s.panel,
        borderColor: failed
          ? 'var(--semantic-color-feedback-error)'
          : 'var(--semantic-color-feedback-success)',
      }}
    >
      <Stack direction="row" align="center" gap="px8">
        <span style={s.panelLabel}>
          {failed ? 'failed' : 'ran'} in {r.durationMs ?? 0}ms
          {r.exitCode !== undefined && r.exitCode !== null ? ` · exit ${r.exitCode}` : ''}
          {r.timedOut ? ' · timeout' : ''}
        </span>
      </Stack>
      {skill.showJsonResult && r.parsedOutput ? (
        <JsonPreview data={r.parsedOutput} />
      ) : (
        <pre style={s.panelStdout}>
          {(r.error ?? r.stderr ?? r.stdout ?? '').slice(-600).trimEnd() || '(no output)'}
        </pre>
      )}
    </Stack>
  );
}

function JsonPreview({ data }: { data: unknown }) {
  if (data && typeof data === 'object' && 'summary' in (data as Record<string, unknown>)) {
    const summary = (data as { summary: unknown }).summary as
      | {
          eligible?: number;
          topN?: number;
          units?: Array<{ id: string; name?: string; tier?: string }>;
          stale?: Array<{ id: string }>;
          threshold_hours?: number;
          totalApproved?: number;
          clusterCount?: number;
          byCluster?: Record<string, Array<{ id: string; ageDays?: number }>>;
        }
      | undefined;

    if (typeof summary?.totalApproved === 'number' && summary.byCluster) {
      const clusters = Object.entries(summary.byCluster);
      return (
        <Stack direction="column" gap="px2">
          <div style={s.jsonHead}>
            {summary.totalApproved} approved · {summary.clusterCount ?? clusters.length} cluster(s)
          </div>
          {clusters.slice(0, 5).map(([cluster, units]) => (
            <Stack
              key={cluster}
              direction="row"
              align="center"
              gap="px8"
              style={{ fontSize: hds.fontSize.xs, fontFamily: hds.monoFamily }}
            >
              <span style={s.jsonId}>{cluster}</span>
              <span style={s.jsonMeta}>{units.length}</span>
            </Stack>
          ))}
          {clusters.length > 5 && <span style={s.jsonMeta}>...{clusters.length - 5} more</span>}
        </Stack>
      );
    }

    if (summary?.units) {
      return (
        <Stack direction="column" gap="px2">
          <div style={s.jsonHead}>
            {summary.eligible ?? summary.units.length} eligible · top{' '}
            {summary.topN ?? summary.units.length}
          </div>
          {summary.units.slice(0, 5).map((u) => (
            <Stack
              key={u.id}
              direction="row"
              align="center"
              gap="px8"
              style={{ fontSize: hds.fontSize.xs, fontFamily: hds.monoFamily }}
            >
              <span style={s.jsonId}>{u.id}</span>
              {u.tier && <span style={s.jsonMeta}>{u.tier}</span>}
            </Stack>
          ))}
        </Stack>
      );
    }
    if (summary?.stale) {
      return (
        <Stack direction="column" gap="px2">
          <div style={s.jsonHead}>
            {summary.stale.length} stale (≥{summary.threshold_hours ?? '?'}h)
          </div>
          {summary.stale.slice(0, 5).map((u) => (
            <Stack
              key={u.id}
              direction="row"
              align="center"
              gap="px8"
              style={{ fontSize: hds.fontSize.xs, fontFamily: hds.monoFamily }}
            >
              <span style={s.jsonId}>{u.id}</span>
            </Stack>
          ))}
          {summary.stale.length === 0 && <div style={s.jsonMeta}>watchdog is happy</div>}
        </Stack>
      );
    }
  }
  return <pre style={s.panelStdout}>{JSON.stringify(data, null, 2).slice(0, 600)}</pre>;
}

function stateIndicator(state: ButtonState): {
  symbol: string;
  color: string;
  borderColor: string;
} {
  if (state.kind === 'running')
    return {
      symbol: '◐',
      color: 'var(--semantic-color-content-accent)',
      borderColor: 'var(--semantic-color-content-accent)',
    };
  if (state.kind === 'success')
    return {
      symbol: '✓',
      color: 'var(--semantic-color-feedback-success)',
      borderColor: 'var(--semantic-color-feedback-success)',
    };
  if (state.kind === 'error')
    return {
      symbol: '✗',
      color: 'var(--semantic-color-feedback-error)',
      borderColor: 'var(--semantic-color-feedback-error)',
    };
  return {
    symbol: '▸',
    color: 'var(--semantic-color-content-secondary)',
    borderColor: 'var(--semantic-color-border-default)',
  };
}

const s = {
  groupLabel: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    textTransform: 'uppercase' as const, // eyebrow-ok: skill-group kicker
    letterSpacing: '0.08em',
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  groupCount: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-disabled)',
  } as CSSProperties,
  groupGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: hds.space.px8,
  } as CSSProperties,
  button: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)', // grid-ok: small icon + label row; minmax(0,1fr) shrinks label, icon stays auto
    gridTemplateRows: 'auto auto',
    columnGap: hds.space.px8,
    rowGap: hds.space.px2,
    padding: `${hds.space.px12} ${hds.space.px12}`,
    minHeight: '56px',
    background: 'var(--semantic-color-surface-raised)',
    color: 'var(--semantic-color-content-primary)',
    border: '1px solid',
    borderRadius: hds.borderRadius.md,
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontFamily: 'inherit',
  } as CSSProperties,
  buttonIndicator: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.lg,
    lineHeight: 1,
    gridRow: '1 / span 2',
    alignSelf: 'center',
  } as CSSProperties,
  buttonLabel: {
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as CSSProperties,
  buttonHint: {
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as CSSProperties,
  input: {
    width: '100%',
    padding: `${hds.space.px8} ${hds.space.px12}`,
    background: 'var(--semantic-color-surface-page)',
    color: 'var(--semantic-color-content-primary)',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius.md,
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
  } as CSSProperties,
  panel: {
    border: '1px solid',
    borderRadius: hds.borderRadius.md,
    padding: hds.space.px8,
    background: 'var(--semantic-color-surface-raised)',
    minWidth: 0,
  } as CSSProperties,
  panelLabel: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  panelStdout: {
    margin: 0,
    padding: 0,
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-primary)',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    maxHeight: '160px',
    overflow: 'auto',
  } as CSSProperties,
  jsonHead: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  jsonId: {
    color: 'var(--semantic-color-content-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as CSSProperties,
  jsonMeta: {
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
};
