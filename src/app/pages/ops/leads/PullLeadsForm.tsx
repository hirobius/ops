/* hds-bypass: ops-internal page. Inline styles intentional for ops dashboard. */

/**
 * PullLeadsForm — niche + metro + count → POST /api/pull-leads.
 *
 * v1 trigger for the Leads board. Sources a single page of Places results and
 * upserts them to Supabase (status='sourced'). On success calls onInserted so
 * the parent can refetch the board immediately. Mirrors SessionInputForm's
 * shape (design-system primitives + token-driven inline styles).
 */

import { useState, type CSSProperties, type FormEvent } from 'react';
import { Stack } from '@hirobius/design-system';
import { Badge } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';

type SubmitStatus =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done'; inserted: number }
  | { kind: 'error'; message: string };

export interface PullLeadsFormProps {
  onInserted?: (inserted: number) => void;
}

export function PullLeadsForm({ onInserted }: PullLeadsFormProps) {
  const [niche, setNiche] = useState('');
  const [metro, setMetro] = useState('');
  const [count, setCount] = useState(20);
  const [status, setStatus] = useState<SubmitStatus>({ kind: 'idle' });

  const canSubmit = niche.trim().length > 0 && metro.trim().length > 0 && status.kind !== 'sending';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus({ kind: 'sending' });
    try {
      const response = await fetch('/api/pull-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche: niche.trim(), metro: metro.trim(), count }),
      });
      const data = (await response.json()) as { inserted?: number; error?: string };
      if (response.ok && typeof data.inserted === 'number') {
        setStatus({ kind: 'done', inserted: data.inserted });
        onInserted?.(data.inserted);
      } else {
        setStatus({
          kind: 'error',
          message: data.error ?? `Request failed (HTTP ${response.status})`,
        });
      }
    } catch (error) {
      setStatus({ kind: 'error', message: (error as Error).message });
    }
  }

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      <Stack direction="column" gap="gap">
        <Stack direction="row" gap="gap" align="end" wrap="wrap">
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>Niche</span>
            <input
              type="text"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="e.g. roofers"
              disabled={status.kind === 'sending'}
              style={inputStyle}
            />
          </label>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>Metro</span>
            <input
              type="text"
              value={metro}
              onChange={(e) => setMetro(e.target.value)}
              placeholder="e.g. Austin, TX"
              disabled={status.kind === 'sending'}
              style={inputStyle}
            />
          </label>
          <label style={countFieldStyle}>
            <span style={fieldLabelStyle}>Count</span>
            <input
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(clampCount(e.target.value))}
              disabled={status.kind === 'sending'}
              style={countInputStyle}
            />
          </label>
          <button
            type="submit"
            disabled={!canSubmit}
            style={canSubmit ? buttonStyle : buttonDisabledStyle}
          >
            {status.kind === 'sending' ? 'Pulling…' : 'Pull leads'}
          </button>
        </Stack>
        {status.kind === 'done' && (
          <Stack direction="row" gap="gap" align="center" wrap="wrap">
            <Badge tone="success">Sourced</Badge>
            <span style={statusTextStyle}>
              {status.inserted} lead{status.inserted === 1 ? '' : 's'} upserted.
            </span>
          </Stack>
        )}
        {status.kind === 'error' && (
          <Stack direction="row" gap="gap" align="center" wrap="wrap">
            <Badge tone="danger">Error</Badge>
            <span style={statusTextStyle}>{status.message}</span>
          </Stack>
        )}
      </Stack>
    </form>
  );
}

function clampCount(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(Math.floor(n), 50));
}

// ── Styles (mobile-first; tap targets ≥ 44px) ───────────────────────────────────

const formStyle: CSSProperties = {
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
  flex: '1 1 12rem',
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

const inputStyle: CSSProperties = {
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
  ...inputStyle,
  width: '6rem',
};

const buttonStyle: CSSProperties = {
  ...hds.typeStyles.ui,
  padding: '10px 20px',
  minHeight: '44px',
  border: '1px solid var(--semantic-color-content-accent)',
  borderRadius: hds.borderRadius[8],
  background: 'var(--semantic-color-content-accent)',
  color: 'var(--semantic-color-surface-raised)',
  cursor: 'pointer',
  flex: '0 0 auto',
};

const buttonDisabledStyle: CSSProperties = {
  ...buttonStyle,
  opacity: 0.5,
  cursor: 'not-allowed',
  background: 'transparent',
  color: 'var(--semantic-color-content-secondary)',
  border: '1px solid var(--semantic-color-border-subdued)',
};

const statusTextStyle: CSSProperties = {
  ...hds.typeStyles.ui,
  color: 'var(--semantic-color-content-secondary)',
};
