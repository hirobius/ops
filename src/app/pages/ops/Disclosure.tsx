/* hds-bypass: ops-internal chrome. Inline styles intentional for standalone ops surfaces. */
/* eslint-disable react-hooks/set-state-in-effect -- localStorage hydration on mount is intentional: avoids SSR mismatch */
/* eslint-disable no-restricted-syntax -- ops-internal; grid layout intentional */

/**
 * Disclosure — controlled collapsible section. Visually matches the Section
 * eyebrow+hint pattern used across /ops surfaces; adds a chevron + click
 * affordance on the head, smooth expand/collapse via CSS grid rows trick,
 * and per-section open/closed persistence in localStorage.
 *
 * Drop-in for the existing inline `<Section label hint>` usage in /ops.
 *
 * Storage key shape: `ops.disclosure.<id>` — namespaced so changing the
 * surface's id resets remembered state cleanly.
 */

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import hds from '@hirobius/design-system/tokens';

export interface DisclosureProps {
  /** Stable identifier — used as the localStorage suffix. */
  id: string;
  label: string;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

const STORAGE_PREFIX = 'ops.disclosure.';

function readStored(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === '1';
  } catch {
    return fallback;
  }
}

export function Disclosure({ id, label, hint, defaultOpen = false, children }: DisclosureProps) {
  const storageKey = `${STORAGE_PREFIX}${id}`;
  // Lazy initial state — read localStorage once on mount to avoid SSR mismatch.
  const [open, setOpen] = useState<boolean>(defaultOpen);

  useEffect(() => {
    setOpen(readStored(storageKey, defaultOpen));
  }, [storageKey, defaultOpen]);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, next ? '1' : '0');
      } catch {
        /* localStorage unavailable — fall through with in-memory state. */
      }
      return next;
    });
  }, [storageKey]);

  return (
    <section style={s.root}>
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="hds-focus"
        style={s.head}
      >
        <ChevronRight
          size={14}
          aria-hidden="true"
          style={{
            color: 'var(--semantic-color-content-secondary)',
            transition: `transform ${hds.duration.fast} ease-out`,
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            flexShrink: 0,
          }}
        />
        <span style={s.label}>{label}</span>
        {hint && <span style={s.hint}>{hint}</span>}
      </button>

      <div
        style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: `grid-template-rows ${hds.duration.normal} ease-out`,
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <div style={{ paddingTop: hds.space.px8 }}>{children}</div>
        </div>
      </div>
    </section>
  );
}

const s = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px8,
  },
  head: {
    display: 'flex',
    alignItems: 'baseline',
    gap: hds.space.px8,
    width: '100%',
    background: 'transparent',
    border: 'none',
    padding: `0 0 ${hds.space.px4} 0`,
    borderBottom: '1px solid var(--semantic-color-border-default)',
    cursor: 'pointer',
    textAlign: 'left' as const,
    color: 'inherit',
  },
  label: {
    ...hds.typeStyles.eyebrow,
    color: 'var(--semantic-color-content-secondary)',
    flex: '1 1 auto' as const,
  },
  hint: {
    ...hds.typeStyles.mono,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
    flexShrink: 0,
  },
} satisfies Record<string, CSSProperties>;
