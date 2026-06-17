/* hds-bypass: ops-internal page */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import hds from '@hirobius/design-system/tokens';
import { Button } from '@hirobius/design-system';
import type { PromoteResult } from './promoteThread';
import type { PromoteTarget } from './threads-types';

interface PromotePopoverProps {
  defaultTitle: string;
  defaultAssignee?: string;
  assignees: string[];
  onConfirm: (input: {
    titleOverride: string;
    assignee: string | undefined;
    target: PromoteTarget;
  }) => Promise<PromoteResult>;
  onClose: () => void;
  /** Optional context line shown above the form. */
  hint?: ReactNode;
}

export function PromotePopover({
  defaultTitle,
  defaultAssignee = '',
  assignees,
  onConfirm,
  onClose,
  hint,
}: PromotePopoverProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [assignee, setAssignee] = useState<string>(defaultAssignee);
  const [target, setTarget] = useState<PromoteTarget>('triage');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.select();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleConfirm = async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await onConfirm({
      titleOverride: title.trim(),
      assignee: assignee || undefined,
      target,
    });
    if (result.ok === false) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    onClose();
  };

  return (
    <div style={s.root} role="dialog" aria-label="Promote to Hermes task">
      {hint && <div style={s.hint}>{hint}</div>}
      <label style={s.field}>
        <span style={s.fieldLabel}>title</span>
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={240}
          style={s.input}
          className="hds-focus"
        />
      </label>
      <div style={s.row}>
        <label style={{ ...s.field, flex: '1 1 auto' }}>
          <span style={s.fieldLabel}>assignee</span>
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            style={s.input}
            className="hds-focus"
          >
            <option value="">— unassigned —</option>
            {assignees.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <fieldset style={s.targetGroup}>
          <legend style={s.fieldLabel}>land in</legend>
          <label style={s.radioLabel}>
            <input
              type="radio"
              name="promote-target"
              value="triage"
              checked={target === 'triage'}
              onChange={() => setTarget('triage')}
            />
            <span>triage</span>
          </label>
          <label style={s.radioLabel}>
            <input
              type="radio"
              name="promote-target"
              value="ready"
              checked={target === 'ready'}
              onChange={() => setTarget('ready')}
            />
            <span>ready</span>
          </label>
        </fieldset>
      </div>
      {error && <div style={s.error}>{error}</div>}
      <div style={s.actions}>
        <Button
          size="sm"
          variant="secondary"
          onClick={onClose}
          disabled={submitting}
        >
          cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => { void handleConfirm(); }}
          disabled={submitting || !title.trim()}
        >
          {submitting ? 'promoting…' : 'promote'}
        </Button>
      </div>
    </div>
  );
}

const s = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px12,
    padding: hds.space.px16,
    background: 'var(--semantic-color-surface-raised)',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius.md,
    width: 'min(420px, 100%)',
    boxShadow: '0 6px 16px rgba(0,0,0,0.18)',
  },
  hint: {
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
    lineHeight: 1.45,
  },
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px4,
    minWidth: 0,
  },
  fieldLabel: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize['2xs'],
    textTransform: 'uppercase' as const, // eyebrow-ok: form field kicker
    letterSpacing: '0.08em',
    color: 'var(--semantic-color-content-secondary)',
  },
  input: {
    fontFamily: 'inherit',
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-primary)',
    background: 'var(--semantic-color-surface-page)',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius.sm,
    padding: `${hds.space.px8} ${hds.space.px12}`,
    minWidth: 0,
  },
  row: {
    display: 'flex',
    gap: hds.space.px12,
    alignItems: 'flex-end',
    flexWrap: 'wrap' as const,
  },
  targetGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px4,
    border: 'none',
    padding: 0,
    margin: 0,
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px8,
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-primary)',
    cursor: 'pointer',
  },
  error: {
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-feedback-error)',
    fontFamily: hds.monoFamily,
    background: 'var(--semantic-color-surface-page)',
    padding: hds.space.px8,
    borderRadius: hds.borderRadius.sm,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap:            hds.space.px8,
  },
} satisfies Record<string, CSSProperties>;
