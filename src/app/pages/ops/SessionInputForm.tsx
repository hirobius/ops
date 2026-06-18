/* hds-bypass: ops-internal page. Inline styles intentional for ops dashboard. */

/**
 * SessionInputForm — textarea + client picker + send button for the Sessions feed.
 *
 * Extracted from SessionsPage so both the inline /ops/sessions view and future
 * Cmd-K modal can mount it. POSTs to /api/route (vite dev middleware) and calls
 * onResult with the raw AssignerResult so the parent can build optimistic events.
 */

import { useState, type CSSProperties, type FormEvent } from 'react';
import { Stack } from '@hirobius/design-system';
import { Badge } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import type { AgentTier } from '../../components/agent-tag';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AssignerResult {
  verdict:      'task' | 'not-task' | 'ambiguous';
  taskId?:      string;
  title?:       string;
  tier?:        AgentTier;
  model?:       string;
  effort?:      string;
  costCeiling?: number;
  routedAt?:    string;
  rationale?:   string;
  reason?:      string;
  client?:      string;
  createdNew?:  boolean;
}

type SubmitStatus =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'task';      result: AssignerResult }
  | { kind: 'not-task';  reason: string }
  | { kind: 'ambiguous'; reason: string }
  | { kind: 'error';     message: string };

// ── Props ─────────────────────────────────────────────────────────────────────

export interface SessionInputFormProps {
  clients:        string[];
  defaultClient?: string;
  onResult?:      (result: AssignerResult) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SessionInputForm({ clients, defaultClient, onResult }: SessionInputFormProps) {
  const resolvedDefault = defaultClient ?? clients[0] ?? '';
  const [text, setText]     = useState('');
  const [client, setClient] = useState(resolvedDefault);
  const [status, setStatus] = useState<SubmitStatus>({ kind: 'idle' });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setStatus({ kind: 'sending' });
    try {
      const response = await fetch('/api/route', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: value, client }),
      });
      const data = await response.json() as { code: number; result: AssignerResult | null; stderr?: string };
      if (data.code === 0 && data.result?.verdict === 'task') {
        if (data.result) onResult?.(data.result);
        setStatus({ kind: 'task', result: data.result });
        setText('');
      } else if (data.code === 2) {
        setStatus({ kind: 'not-task', reason: data.result?.reason ?? 'Logged as memory note.' });
        setText('');
      } else if (data.code === 3) {
        setStatus({ kind: 'ambiguous', reason: data.result?.reason ?? 'Clarify or rephrase.' });
      } else {
        setStatus({ kind: 'error', message: data.stderr ?? `Assigner exited with code ${data.code}` });
      }
    } catch (error) {
      setStatus({ kind: 'error', message: (error as Error).message });
    }
  }

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      <Stack direction="column" gap="gap">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Describe a task. Prefix with [client-slug] to override target. (Default: ${resolvedDefault})`}
          rows={3}
          disabled={status.kind === 'sending'}
          style={textareaStyle}
        />
        <Stack direction="row" gap="gap" align="center" wrap="wrap" justify="space-between">
          <label style={labelStyle}>
            <span style={{ ...hds.typeStyles.eyebrow, color: 'var(--semantic-color-content-secondary)' }}>
              Client
            </span>
            <select
              value={client}
              onChange={(e) => setClient(e.target.value)}
              disabled={status.kind === 'sending' || clients.length === 0}
              style={selectStyle}
            >
              {clients.map((slug) => (
                <option key={slug} value={slug}>{slug}</option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={status.kind === 'sending' || !text.trim()}
            style={status.kind === 'sending' || !text.trim() ? sendButtonDisabledStyle : sendButtonStyle}
          >
            {status.kind === 'sending' ? 'Routing…' : 'Send'}
          </button>
        </Stack>
        {status.kind !== 'idle' && status.kind !== 'sending' && (
          <SubmitStatusBanner status={status} />
        )}
      </Stack>
    </form>
  );
}

// ── Status banner ──────────────────────────────────────────────────────────────

function SubmitStatusBanner({ status }: { status: Exclude<SubmitStatus, { kind: 'idle' } | { kind: 'sending' }> }) {
  if (status.kind === 'task') {
    const r = status.result;
    return (
      <Stack direction="row" gap="gap" align="center" wrap="wrap">
        <Badge tone="success">Routed</Badge>
        <span style={statusTextStyle}>
          <code style={inlineCodeStyle}>{r.taskId}</code>{' → '}<code style={inlineCodeStyle}>{r.model}</code>
          {r.tier ? <>{' · '}<code style={inlineCodeStyle}>{r.tier}</code></> : null}
        </span>
      </Stack>
    );
  }
  if (status.kind === 'not-task') {
    return (
      <Stack direction="row" gap="gap" align="center" wrap="wrap">
        <Badge tone="neutral">Note</Badge>
        <span style={statusTextStyle}>{status.reason}</span>
      </Stack>
    );
  }
  if (status.kind === 'ambiguous') {
    return (
      <Stack direction="row" gap="gap" align="center" wrap="wrap">
        <Badge tone="warning">Ambiguous</Badge>
        <span style={statusTextStyle}>{status.reason}</span>
      </Stack>
    );
  }
  return (
    <Stack direction="row" gap="gap" align="center" wrap="wrap">
      <Badge tone="danger">Error</Badge>
      <span style={statusTextStyle}>{status.message}</span>
    </Stack>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
// Mobile-first: every element flows full-width up to a sensible max.
// No fixed pixel widths on inputs. Tap targets >= 44px high.

const formStyle: CSSProperties = {
  border:       '1px solid var(--semantic-color-border-default)',
  borderRadius: hds.borderRadius[8],
  padding:      hds.semantic.space.component.gap,
  background:   'var(--semantic-color-surface-raised)',
  width:        '100%',
};

const textareaStyle: CSSProperties = {
  ...hds.typeStyles.body,
  width:        '100%',
  minHeight:    '88px',
  padding:      hds.space.px12,
  border:       '1px solid var(--semantic-color-border-default)',
  borderRadius: hds.borderRadius[8],
  background:   'transparent',
  color:        'var(--semantic-color-content-primary)',
  resize:       'vertical',
  fontFamily:   'inherit',
  boxSizing:    'border-box',
};

const labelStyle: CSSProperties = {
  display:    'flex',
  alignItems: 'center',
  gap:        hds.space.px8,
  flexWrap:   'wrap',
};

const selectStyle: CSSProperties = {
  ...hds.typeStyles.ui,
  padding:      '8px 12px',
  minHeight:    '44px',
  border:       '1px solid var(--semantic-color-border-default)',
  borderRadius: hds.borderRadius[8],
  background:   'transparent',
  color:        'var(--semantic-color-content-primary)',
};

const sendButtonStyle: CSSProperties = {
  ...hds.typeStyles.ui,
  padding:      '10px 20px',
  minHeight:    '44px',
  border:       '1px solid var(--semantic-color-content-accent)',
  borderRadius: hds.borderRadius[8],
  background:   'var(--semantic-color-content-accent)',
  color:        'var(--semantic-color-surface-raised)',
  cursor:       'pointer',
};

const sendButtonDisabledStyle: CSSProperties = {
  ...sendButtonStyle,
  opacity:    0.5,
  cursor:     'not-allowed',
  background: 'transparent',
  color:      'var(--semantic-color-content-secondary)',
  border:     '1px solid var(--semantic-color-border-subdued)',
};

const statusTextStyle: CSSProperties = {
  ...hds.typeStyles.ui,
  color: 'var(--semantic-color-content-secondary)',
};

const inlineCodeStyle: CSSProperties = {
  ...hds.typeStyles.mono,
  color: 'var(--semantic-color-content-primary)',
};
