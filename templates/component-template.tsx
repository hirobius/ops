"use client";

/**
 * __NAME__ — Swiss-canonical component scaffold.
 * @category Component
 *
 * Body emphasis is font-medium (500), never bold. Color hierarchy uses
 * opacity on a single hue (semantic.color.content.{primary,secondary,
 * tertiary}), never a second hue. Spacing on the 8px grid only.
 */

import type { CSSProperties, ReactNode } from 'react';
import hds from '../design-system/tokens';

interface __NAME__Props {
  /** Variant — primary | secondary | tertiary. */
  variant?: 'primary' | 'secondary' | 'tertiary';
  /** Slot content. */
  children?: ReactNode;
  /** Optional inline styles for one-off layout adjustments. */
  style?: CSSProperties;
  /** Optional class hook for parent-level styling. */
  className?: string;
}

const baseStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: hds.space.gap.md,
  padding: hds.space.layout.tight,
  background: 'var(--semantic-color-surface-raised)',
  color: 'var(--semantic-color-content-primary)',
  borderRadius: 'var(--semantic-radius-action)',
  fontFamily: 'var(--primitive-typography-family-primary)',
  fontWeight: 400,
  boxSizing: 'border-box' as const,
} satisfies CSSProperties;

export function __NAME__({
  variant = 'primary',
  children,
  style,
  className,
}: __NAME__Props) {
  return (
    <div
      data-component="__NAME__"
      data-variant={variant}
      className={className}
      style={{ ...baseStyle, ...style }}
    >
      {children}
    </div>
  );
}

export default __NAME__;
