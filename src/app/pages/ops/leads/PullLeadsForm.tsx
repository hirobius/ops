/**
 * PullLeadsForm — niche + metro + count → POST /api/pull-leads.
 *
 * v1 trigger for the Leads board. Sources a single page of Places results and
 * upserts them to Supabase (status='sourced'). On success calls onInserted so
 * the parent can refetch the board immediately.
 *
 * Chrome is a bordered HDS Card, labels are <Text variant=eyebrow>, the status
 * line is <Text variant=ui>, and each field is a column <Stack as=label>. The
 * native inputs and submit keep local styles: HDS Input adds a clear button
 * and its own shell, and HDS Button is 40/48px tall with a filled disabled
 * state — both would change the rendered pixels (ops#425).
 */

import { useState, type CSSProperties, type FormEvent } from 'react';
import { Stack, Badge, Card, Text } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { opsApi } from '../../../lib/opsApi';

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
      const response = await opsApi.post('/api/pull-leads', {
        niche: niche.trim(),
        metro: metro.trim(),
        count,
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
    <Card as="form" bordered padding="none" onSubmit={handleSubmit} style={formStyle}>
      <Stack direction="column" gap="gap">
        <Stack direction="row" gap="gap" align="end" wrap="wrap">
          <Stack as="label" direction="column" gap="px4" style={fieldStyle}>
            <Text variant="eyebrow" as="span" style={secondaryText}>
              Niche
            </Text>
            <input
              type="text"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="e.g. roofers"
              disabled={status.kind === 'sending'}
              style={inputStyle}
            />
          </Stack>
          <Stack as="label" direction="column" gap="px4" style={fieldStyle}>
            <Text variant="eyebrow" as="span" style={secondaryText}>
              Metro
            </Text>
            <input
              type="text"
              value={metro}
              onChange={(e) => setMetro(e.target.value)}
              placeholder="e.g. Austin, TX"
              disabled={status.kind === 'sending'}
              style={inputStyle}
            />
          </Stack>
          <Stack as="label" direction="column" gap="px4" style={countFieldStyle}>
            <Text variant="eyebrow" as="span" style={secondaryText}>
              Count
            </Text>
            <input
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(clampCount(e.target.value))}
              disabled={status.kind === 'sending'}
              style={countInputStyle}
            />
          </Stack>
          <button
            type="submit"
            disabled={!canSubmit}
            className="hds-focus"
            style={canSubmit ? buttonStyle : buttonDisabledStyle}
          >
            {status.kind === 'sending' ? 'Pulling…' : 'Pull leads'}
          </button>
        </Stack>
        {status.kind === 'done' && (
          <Stack direction="row" gap="gap" align="center" wrap="wrap">
            <Badge tone="success">Sourced</Badge>
            <Text variant="ui" as="span" style={secondaryText}>
              {status.inserted} lead{status.inserted === 1 ? '' : 's'} upserted.
            </Text>
          </Stack>
        )}
        {status.kind === 'error' && (
          <Stack direction="row" gap="gap" align="center" wrap="wrap">
            <Badge tone="danger">Error</Badge>
            <Text variant="ui" as="span" style={secondaryText}>
              {status.message}
            </Text>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

function clampCount(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(Math.floor(n), 50));
}

// ── Styles (mobile-first; tap targets ≥ 44px) ───────────────────────────────────

/** Card supplies the border + raised surface; the 8px inset and 8px radius
 *  sit below its padding scale (16/24) and default radius (12). */
const formStyle: CSSProperties = {
  padding: hds.semantic.space.component.gap,
  borderRadius: hds.borderRadius[8],
  width: '100%',
};

const fieldStyle: CSSProperties = { flex: '1 1 12rem', minWidth: 0 };

const countFieldStyle: CSSProperties = { flex: '0 0 auto' };

const secondaryText: CSSProperties = { color: 'var(--semantic-color-content-secondary)' };

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
