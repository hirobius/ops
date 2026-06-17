/** Canon fixture: INLINE_THIN_BAR — triggers inline thin colored bar pattern */
import React from 'react';

export function InlineThinBarFixture() {
  return (
    <div>
      <div style={{ height: '4px', background: 'var(--hds-color-accent)' }} />
      <p>Content below the inline thin bar crowding the prose.</p>
    </div>
  );
}
