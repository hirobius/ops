/* hds-bypass: ops-internal page */
/* eslint-disable react-hooks/set-state-in-effect -- mount-time queue hydration via fetch is intentional: matches PluginsBar / ResearchBar idiom and avoids SSR mismatch */

/**
 * SkillCreatorForm — natural-language capture seam for new skill ideas.
 *
 * Adrian (or any operator on the LAN /ops surface) describes a skill in
 * plain language; submission POSTs to `/api/proposed-skills`, which
 * appends one JSONL line to `docs/ai/proposed-skills.jsonl` — a
 * gitignored, append-only inbox that mirrors `proposed-units.jsonl`.
 *
 * Build is explicitly deferred. The next interactive Claude Code session
 * reads the queue, runs `brainstorming` against Adrian to fill gaps,
 * then writes the actual skill (script + skills.ts entry + middleware
 * whitelist). This button captures intent ONLY — pure-auto build was
 * rejected to avoid polluting the repo with low-quality skills.
 *
 * Schema: { ts, name, description, expectedOutput, requestedBy }.
 */

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; ts: string; queueLength: number }
  | { kind: 'error'; message: string };

interface QueueResponse {
  items: Array<{ ts?: string; name?: string }>;
}

const MAX_NAME = 80;
const MAX_TEXT = 1_000;

export function SkillCreatorForm() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [expectedOutput, setExpectedOutput] = useState('');
  const [state, setState] = useState<SubmitState>({ kind: 'idle' });
  const [queueLength, setQueueLength] = useState<number | null>(null);

  const refreshQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/proposed-skills');
      if (!res.ok) return;
      const body = (await res.json()) as QueueResponse;
      setQueueLength(Array.isArray(body.items) ? body.items.length : 0);
    } catch {
      // Endpoint unavailable in prod build or dev not running — leave queue
      // length as null and the form stays usable for offline drafting (POST
      // will surface a clear error).
    }
  }, []);

  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedName = name.trim();
      const trimmedDescription = description.trim();
      if (!trimmedName || !trimmedDescription) {
        setState({ kind: 'error', message: 'Name and description are both required.' });
        return;
      }
      setState({ kind: 'submitting' });
      try {
        const res = await fetch('/api/proposed-skills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: trimmedName,
            description: trimmedDescription,
            expectedOutput: expectedOutput.trim(),
            requestedBy: 'adrian',
          }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          ts?: string;
          error?: string;
        };
        if (!res.ok || !body.ok) {
          setState({
            kind: 'error',
            message: body.error || `submit failed (HTTP ${res.status})`,
          });
          return;
        }
        // Reset the form; refresh queue length so the operator can see it grew.
        setName('');
        setDescription('');
        setExpectedOutput('');
        await refreshQueue();
        setState({
          kind: 'success',
          ts: body.ts ?? new Date().toISOString(),
          queueLength: (queueLength ?? 0) + 1,
        });
      } catch (err) {
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [name, description, expectedOutput, queueLength, refreshQueue],
  );

  const submitting = state.kind === 'submitting';
  const canSubmit = name.trim().length > 0 && description.trim().length > 0 && !submitting;

  return (
    <form onSubmit={handleSubmit} aria-busy={submitting} style={s.form}>
      <Stack direction="column" gap="px16" style={{ minWidth: 0 }}>
        <p style={s.lede}>
          Describe a skill in your own words. Submission appends one line to{' '}
          <code style={s.code}>docs/ai/proposed-skills.jsonl</code>; build happens in the next
          interactive Claude Code session — this button captures intent only.
        </p>

        <Field
          id="skill-creator-name"
          label="Name"
          hint="short identifier — e.g. parse-invoices"
          value={name}
          onChange={setName}
          maxLength={MAX_NAME}
          required
          submitting={submitting}
        />

        <Field
          id="skill-creator-description"
          label="Description"
          hint="what should it do? include constraints, file paths, edge cases"
          value={description}
          onChange={setDescription}
          maxLength={MAX_TEXT}
          multiline
          required
          submitting={submitting}
        />

        <Field
          id="skill-creator-expected"
          label="Expected output"
          hint="optional — what does success look like?"
          value={expectedOutput}
          onChange={setExpectedOutput}
          maxLength={MAX_TEXT}
          multiline
          submitting={submitting}
        />

        <Stack direction="row" align="center" justify="space-between" gap="px8" wrap="wrap">
          <span style={s.queueLabel}>
            queue:{' '}
            <span style={s.queueCount}>
              {queueLength === null ? '—' : `${queueLength} pending`}
            </span>
          </span>
          <button
            type="submit"
            disabled={!canSubmit}
            aria-disabled={!canSubmit}
            className="hds-focus"
            style={{
              ...s.submit,
              opacity: canSubmit ? 1 : 0.5,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
          >
            {submitting ? 'submitting…' : 'capture skill idea'}
          </button>
        </Stack>

        <StatusLine state={state} />
      </Stack>
    </form>
  );
}

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  multiline?: boolean;
  required?: boolean;
  submitting: boolean;
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  maxLength,
  multiline = false,
  required = false,
  submitting,
}: FieldProps) {
  const counter = `${value.length}/${maxLength}`;
  return (
    <Stack direction="column" gap="px4" style={{ minWidth: 0 }}>
      <Stack direction="row" align="center" justify="space-between" gap="px8">
        <label htmlFor={id} style={s.label}>
          {label}
          {required && (
            <span style={s.required} aria-hidden="true">
              {' '}
              *
            </span>
          )}
        </label>
        <span style={s.counter} aria-hidden="true">
          {counter}
        </span>
      </Stack>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          required={required}
          disabled={submitting}
          rows={3}
          className="hds-focus"
          style={{ ...s.input, ...s.textarea }}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          required={required}
          disabled={submitting}
          className="hds-focus"
          style={s.input}
        />
      )}
      {hint && <span style={s.hint}>{hint}</span>}
    </Stack>
  );
}

function StatusLine({ state }: { state: SubmitState }) {
  if (state.kind === 'idle') {
    return (
      <span style={{ ...s.statusBase, ...s.statusIdle }}>
        ready · build is deferred to next /loop session
      </span>
    );
  }
  if (state.kind === 'submitting') {
    return <span style={{ ...s.statusBase, ...s.statusBusy }}>appending to queue…</span>;
  }
  if (state.kind === 'success') {
    return (
      <span style={{ ...s.statusBase, ...s.statusOk }} role="status">
        captured at {new Date(state.ts).toLocaleTimeString()} · queue now {state.queueLength}
      </span>
    );
  }
  return (
    <span style={{ ...s.statusBase, ...s.statusErr }} role="alert">
      {state.message}
    </span>
  );
}

const s = {
  form: {
    minWidth: 0,
  } as CSSProperties,
  lede: {
    margin: 0,
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-secondary)',
    lineHeight: 1.5,
  } as CSSProperties,
  code: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    padding: `0 ${hds.space.px4}`,
    background: 'var(--semantic-color-surface-raised)',
    borderRadius: hds.borderRadius[2],
    color: 'var(--semantic-color-content-primary)',
  } as CSSProperties,
  label: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    textTransform: 'uppercase' as const, // eyebrow-ok: form-field kicker matches SkillsBar group label idiom
    letterSpacing: '0.08em',
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  required: {
    color: 'var(--semantic-color-feedback-error)',
  } as CSSProperties,
  hint: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-disabled)',
  } as CSSProperties,
  counter: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-disabled)',
  } as CSSProperties,
  input: {
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: `${hds.space.px8} ${hds.space.px12}`,
    background: 'var(--semantic-color-surface-raised)',
    color: 'var(--semantic-color-content-primary)',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius.md,
    fontFamily: 'inherit',
    fontSize: hds.fontSize.sm,
    minWidth: 0,
  } as CSSProperties,
  textarea: {
    resize: 'vertical' as const,
    minHeight: '64px',
    fontFamily: hds.monoFamily,
    lineHeight: 1.5,
  } as CSSProperties,
  submit: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.sm,
    padding: `${hds.space.px8} ${hds.space.px16}`,
    background: 'var(--semantic-color-content-accent)',
    color: 'var(--semantic-color-surface-base)',
    border: '1px solid var(--semantic-color-content-accent)',
    borderRadius: hds.borderRadius.md,
    cursor: 'pointer',
  } as CSSProperties,
  queueLabel: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  queueCount: {
    color: 'var(--semantic-color-content-primary)',
  } as CSSProperties,
  statusBase: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
  } as CSSProperties,
  statusIdle: {
    color: 'var(--semantic-color-content-disabled)',
  } as CSSProperties,
  statusBusy: {
    color: 'var(--semantic-color-content-accent)',
  } as CSSProperties,
  statusOk: {
    color: 'var(--semantic-color-feedback-success)',
  } as CSSProperties,
  statusErr: {
    color: 'var(--semantic-color-feedback-error)',
  } as CSSProperties,
};
