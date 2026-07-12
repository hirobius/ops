/* hds-bypass: ops-internal page */

/**
 * ExternalSkillsBar — the external design-quality toolkit catalog
 * (external-skills.ts), rendered with the PluginsBar tile idiom: expandable
 * tiles, copy-to-clipboard invocations. Static import — identical in dev and
 * prod (no fetch, no api/* slot; Vercel Hobby function cap stays untouched).
 */

import { useState, useCallback, type CSSProperties } from 'react';
import { Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import {
  EXTERNAL_SKILLS,
  KIND_LABEL,
  STATUS_LABEL,
  type CatalogStatus,
  type ExternalSkill,
} from './external-skills';

const STATUS_ORDER: readonly CatalogStatus[] = ['installed', 'cli-only', 'external'];

export function ExternalSkillsBar() {
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => (prev === id ? null : id));
  }, []);

  const grouped = new Map<CatalogStatus, ExternalSkill[]>(STATUS_ORDER.map((k) => [k, []]));
  for (const skill of EXTERNAL_SKILLS) grouped.get(skill.status)?.push(skill);

  return (
    <Stack direction="column" gap="px16">
      {STATUS_ORDER.map((status) => {
        const group = grouped.get(status) ?? [];
        if (group.length === 0) return null;
        return (
          <Stack key={status} direction="column" gap="px8" style={{ minWidth: 0 }}>
            <Stack direction="row" align="center" gap="px8">
              <span style={s.groupLabel}>{STATUS_LABEL[status]}</span>
              <span style={s.groupCount}>{group.length}</span>
            </Stack>
            <div style={s.groupGrid}>
              {group.map((skill) => (
                <CatalogTile
                  key={skill.id}
                  skill={skill}
                  open={expanded === skill.id}
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

export function CatalogTile({
  skill,
  open,
  onToggle,
}: {
  skill: ExternalSkill;
  open: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <Stack direction="column" gap="px8" style={{ minWidth: 0 }}>
      <button
        type="button"
        onClick={() => onToggle(skill.id)}
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
            <span style={s.chip}>{KIND_LABEL[skill.kind]}</span>
            <span style={s.chip}>{skill.source}</span>
            {skill.installedIn.map((repo) => (
              <span key={repo} style={{ ...s.chip, ...s.chipInstalled }}>
                {repo}
              </span>
            ))}
          </Stack>
          <p style={s.panelDesc}>{skill.description}</p>
          {skill.invocations.map((inv) => (
            <InvocationRow key={inv.command} label={inv.label} command={inv.command} />
          ))}
          {skill.note && <p style={s.panelNote}>{skill.note}</p>}
        </Stack>
      )}
    </Stack>
  );
}

function InvocationRow({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1_500);
  }, [command]);

  return (
    <Stack direction="column" gap="px2" style={{ minWidth: 0 }}>
      <span style={s.invLabel}>{label}</span>
      <Stack direction="row" align="center" gap="px8" wrap="wrap">
        <code style={s.cmdText}>{command}</code>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? `Copied: ${label}` : `Copy: ${label}`}
          className="hds-focus"
          style={s.copyBtn}
        >
          {copied ? 'copied' : 'copy'}
        </button>
      </Stack>
    </Stack>
  );
}

const s = {
  groupLabel: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    textTransform: 'uppercase' as const, // eyebrow-ok: mono eyebrow label for catalog status groups
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: hds.space.px8,
  } as CSSProperties,
  button: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)', // grid-ok: indicator + label/hint layout within catalog tile button
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
  chip: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    padding: `${hds.space.px2} ${hds.space.px8}`,
    borderRadius: hds.borderRadius.sm,
    border: '1px solid var(--semantic-color-border-default)',
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  chipInstalled: {
    color: 'var(--semantic-color-content-accent)',
    borderColor: 'var(--semantic-color-content-accent)',
  } as CSSProperties,
  invLabel: {
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  cmdText: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-primary)',
    flex: 1,
    overflowWrap: 'anywhere' as const,
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
  panelNote: {
    margin: 0,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-disabled)',
    lineHeight: 1.5,
  } as CSSProperties,
};
