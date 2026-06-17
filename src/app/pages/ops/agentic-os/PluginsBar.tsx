/* hds-bypass: ops-internal page */

import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { fetchCcSkills, type CcSkill } from './cc-plugins';

type Source = 'global' | 'project';

const SOURCE_ORDER: readonly Source[] = ['project', 'global'];
const SOURCE_LABEL: Record<Source, string> = {
  project: 'Project',
  global: 'Global',
};

export function PluginsBar() {
  const [skills, setSkills] = useState<CcSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetchCcSkills().then((s) => {
      setSkills(s);
      setLoading(false);
    });
  }, []);

  const toggle = useCallback((name: string) => {
    setExpanded((prev) => (prev === name ? null : name));
  }, []);

  if (loading) return <div style={s.muted}>loading…</div>;
  if (skills.length === 0) return <div style={s.muted}>No Claude Code skills installed.</div>;

  const grouped = new Map<Source, CcSkill[]>(SOURCE_ORDER.map((src) => [src, []]));
  for (const skill of skills) grouped.get(skill.source)?.push(skill);

  return (
    <Stack direction="column" gap="px16">
      {SOURCE_ORDER.map((src) => {
        const group = grouped.get(src) ?? [];
        if (group.length === 0) return null;
        return (
          <Stack key={src} direction="column" gap="px8" style={{ minWidth: 0 }}>
            <Stack direction="row" align="center" gap="px8">
              <span style={s.groupLabel}>{SOURCE_LABEL[src]}</span>
              <span style={s.groupCount}>{group.length}</span>
            </Stack>
            <div style={s.groupGrid}>
              {group.map((skill) => (
                <SkillTile
                  key={skill.name}
                  skill={skill}
                  open={expanded === skill.name}
                  onToggle={toggle}
                />
              ))}
            </div>
          </Stack>
        );
      })}
    </Stack>
  );
}

function SkillTile({
  skill,
  open,
  onToggle,
}: {
  skill: CcSkill;
  open: boolean;
  onToggle: (name: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(skill.invocation);
    setCopied(true);
    setTimeout(() => setCopied(false), 1_500);
  }, [skill.invocation]);

  return (
    <Stack direction="column" gap="px8" style={{ minWidth: 0 }}>
      <button
        type="button"
        onClick={() => onToggle(skill.name)}
        aria-expanded={open}
        className="hds-focus"
        style={{
          ...s.button,
          borderColor: open
            ? 'var(--semantic-color-content-accent)'
            : 'var(--semantic-color-border-default)',
        }}
      >
        <span
          style={{
            ...s.buttonIndicator,
            color: open
              ? 'var(--semantic-color-content-accent)'
              : 'var(--semantic-color-content-secondary)',
          }}
          aria-hidden="true"
        >
          ▸
        </span>
        <span style={s.buttonLabel}>{skill.name}</span>
        <span style={s.buttonHint}>
          {skill.description.length > 60 ? `${skill.description.slice(0, 60)}…` : skill.description}
        </span>
      </button>

      {open && (
        <Stack direction="column" gap="px8" style={s.panel}>
          <Stack direction="row" align="center" gap="px8" wrap="wrap">
            <code style={s.cmdText}>{skill.invocation}</code>
            <button
              type="button"
              onClick={handleCopy}
              aria-label={copied ? 'Copied to clipboard' : 'Copy to clipboard'}
              className="hds-focus"
              style={s.copyBtn}
            >
              {copied ? 'copied' : 'copy'}
            </button>
          </Stack>
          {skill.description && <p style={s.panelDesc}>{skill.description}</p>}
        </Stack>
      )}
    </Stack>
  );
}

const s = {
  muted: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-disabled)',
  } as CSSProperties,
  groupLabel: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    textTransform: 'uppercase' as const, // eyebrow-ok: mono eyebrow label for plugin category chips
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
    gridTemplateColumns: 'auto minmax(0, 1fr)', // grid-ok: indicator + label/hint layout within skill tile button
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
    whiteSpace: 'nowrap' as const,
  } as CSSProperties,
  buttonHint: {
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as CSSProperties,
  panel: {
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius.md,
    padding: hds.space.px8,
    background: 'var(--semantic-color-surface-raised)',
    minWidth: 0,
  } as CSSProperties,
  cmdText: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-primary)',
    flex: 1,
  } as CSSProperties,
  copyBtn: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-accent)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: `${hds.space.px4} ${hds.space.px8}`,
    borderRadius: hds.borderRadius.sm,
  } as CSSProperties,
  panelDesc: {
    margin: 0,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
    lineHeight: 1.5,
  } as CSSProperties,
};
