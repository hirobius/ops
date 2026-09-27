/**
 * CopyBox — a monospace text block with a Copy button (ops#427's "How to"
 * step content, and the standalone chore list). `navigator.clipboard` is not
 * available in every context (insecure origin, permission denied, older
 * browser) — a rejection or a thrown call falls back to selecting the text so
 * the person can still Cmd/Ctrl-C it by hand. Either path never throws out of
 * the click handler.
 */

import { useCallback, useRef, useState, type CSSProperties } from 'react';
import { Button } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';

export interface CopyBoxProps {
  text: string;
}

const RESET_MS = 1500;

export function CopyBox({ text }: CopyBoxProps) {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const selectFallback = useCallback(() => {
    const el = preRef.current;
    if (!el || typeof window === 'undefined') return;
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    } catch {
      /* Selection unsupported in this environment — nothing more to do. */
    }
  }, []);

  const handleCopy = useCallback(() => {
    try {
      const result = navigator.clipboard.writeText(text);
      result
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), RESET_MS);
        })
        .catch(selectFallback);
    } catch {
      selectFallback();
    }
  }, [text, selectFallback]);

  return (
    <div style={s.wrap}>
      <pre ref={preRef} style={s.pre}>
        {text}
      </pre>
      <Button size="sm" variant="tertiary" onClick={handleCopy} aria-label="Copy">
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

const s = {
  wrap: {
    display: 'flex',
    alignItems: 'stretch',
    gap: hds.space.px4,
    maxWidth: '100%',
  },
  pre: {
    ...hds.typeStyles.mono,
    margin: 0,
    flex: '1 1 auto',
    minWidth: 0,
    background: 'var(--semantic-color-surface-raised)',
    padding: `${hds.space.px6} ${hds.space.px8}`,
    borderRadius: hds.borderRadius.sm,
    whiteSpace: 'pre-wrap' as const,
    overflowWrap: 'anywhere' as const,
  },
} satisfies Record<string, CSSProperties>;
