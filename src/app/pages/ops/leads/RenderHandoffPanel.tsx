/* hds-bypass: ops-internal page. Inline styles intentional for ops dashboard. */

/**
 * RenderHandoffPanel — the paste-ready output of the Leads board's `render`
 * action (#185).
 *
 * `render` doesn't deploy anything; it returns the drop-in `client.config.ts`
 * source plus the scaffold/deploy commands to run against the clients repo.
 * Per the Working-with-Adrian conventions in CLAUDE.md, anything a human has to
 * paste is given as exact copy-paste text — hence copy buttons rather than
 * "here's roughly what to run".
 *
 * Purely presentational: it renders what it's handed and owns no fetch state.
 */
import { useCallback, useState, type CSSProperties } from 'react';
import hds from '@hirobius/design-system/tokens';
import type { RenderHandoff } from './leadActions';

interface Props {
  leadName: string;
  handoff: RenderHandoff | { error: string };
}

function CopyBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    // clipboard is unavailable over plain http and in some embedded webviews;
    // fail visibly rather than leaving the button looking broken.
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setCopied(false));
  }, [value]);

  return (
    <div style={s.block}>
      <div style={s.blockHead}>
        <span style={s.blockLabel}>{label}</span>
        <button type="button" onClick={copy} className="hds-focus" style={s.copyButton}>
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      <pre style={s.pre}>
        <code>{value}</code>
      </pre>
    </div>
  );
}

export function RenderHandoffPanel({ leadName, handoff }: Props) {
  if ('error' in handoff) {
    return (
      <div style={s.panel} role="status" aria-live="polite">
        <p style={s.error}>
          Render failed for {leadName}: {handoff.error}
        </p>
      </div>
    );
  }

  return (
    <div style={s.panel} role="status" aria-live="polite">
      <p style={s.intro}>
        Hand-off for <strong>{leadName}</strong> — paste the config into the clients repo, then run
        the commands. Nothing has been deployed yet.
      </p>
      <CopyBlock label="client.config.ts" value={handoff.configFile} />
      <CopyBlock label="Commands" value={handoff.commands} />
    </div>
  );
}

const s = {
  panel: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px8,
    marginTop: hds.space.px12,
    padding: hds.space.px12,
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius[2],
    background: 'var(--semantic-color-surface-raised)',
  },
  intro: {
    margin: 0,
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-secondary)',
  },
  error: {
    margin: 0,
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-danger, var(--semantic-color-content-primary))',
  },
  block: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px4,
  },
  blockHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: hds.space.px8,
  },
  blockLabel: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  },
  copyButton: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    padding: `${hds.space.px4} ${hds.space.px8}`,
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius[2],
    background: 'transparent',
    color: 'var(--semantic-color-content-primary)',
    cursor: 'pointer',
  },
  pre: {
    margin: 0,
    padding: hds.space.px8,
    overflowX: 'auto' as const,
    maxHeight: '18rem',
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    lineHeight: 1.5,
    color: 'var(--semantic-color-content-primary)',
    background: 'var(--semantic-color-surface-page)',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius[2],
    whiteSpace: 'pre' as const,
  },
} satisfies Record<string, CSSProperties>;
