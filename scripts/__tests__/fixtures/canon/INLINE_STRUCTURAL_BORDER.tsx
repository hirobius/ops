/** Canon fixture: INLINE_STRUCTURAL_BORDER — triggers inline structural border rule */
import React from 'react';

export function InlineStructuralBorderFixture() {
  return (
    <div style={{ border: '1px solid var(--semantic-color-border-default)' }}>
      <p>This display surface has an inline structural border using a neutral border token.</p>
    </div>
  );
}
