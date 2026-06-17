/* hds-bypass: ops-internal page */

import { useState, type CSSProperties } from 'react';
import hds from '@hirobius/design-system/tokens';
import { Button } from '@hirobius/design-system';

const COMMAND = 'hermes dashboard --no-open';

interface OfflineBannerProps {
  onRetry: () => void;
}

export function OfflineBanner({ onRetry }: OfflineBannerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard.writeText is gated on secure contexts; on http://… in
      // some browsers it rejects. Fall back to selecting the inline code.
      const node = document.getElementById('kanban-offline-cmd');
      if (node && window.getSelection) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  };

  return (
    <div style={s.root} role="status" aria-live="polite">
      <div style={s.headRow}>
        <span style={s.dot} aria-hidden="true">
          ●
        </span>
        <span style={s.title}>Hermes dispatcher offline</span>
      </div>
      <p style={s.body}>
        The Hermes Agent dashboard isn&apos;t reachable on{' '}
        <code style={s.inlineCode}>127.0.0.1:9119</code>. /ops/kanban reads live from that process —
        start it in a terminal and the board will re-populate on the next poll.
      </p>
      <div style={s.cmdRow}>
        <code id="kanban-offline-cmd" style={s.cmd}>
          {COMMAND}
        </code>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleCopy}
          aria-label="Copy command to clipboard"
        >
          {copied ? 'copied' : 'copy'}
        </Button>
        <Button size="sm" variant="primary" onClick={onRetry}>
          retry
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
    padding: `${hds.space.px16} ${hds.space.px20}`,
    background: 'var(--semantic-color-surface-raised)',
    borderLeft: '3px solid var(--semantic-color-feedback-warning)',
    borderRadius: hds.borderRadius.md,
    maxWidth: '720px',
  },
  headRow: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px8,
  },
  dot: {
    color: 'var(--semantic-color-feedback-warning)',
    fontSize: hds.fontSize.sm,
    lineHeight: 1,
  },
  title: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-primary)',
  },
  body: {
    margin: 0,
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-secondary)',
    lineHeight: 1.5,
  },
  inlineCode: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-primary)',
  },
  cmdRow: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px8,
    flexWrap: 'wrap' as const,
  },
  cmd: {
    flex: '1 1 auto',
    minWidth: 0,
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-primary)',
    background: 'var(--semantic-color-surface-page)',
    padding: `${hds.space.px8} ${hds.space.px12}`,
    borderRadius: hds.borderRadius.sm,
    whiteSpace: 'pre' as const,
    overflow: 'auto',
  },
} satisfies Record<string, CSSProperties>;
