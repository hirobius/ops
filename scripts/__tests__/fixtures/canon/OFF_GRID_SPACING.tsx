/** Canon fixture: OFF_GRID_SPACING — triggers off-grid Tailwind spacing utility rule */
import React from 'react';

export function OffGridSpacingFixture() {
  return (
    <div className="p-7">
      <p>This uses p-7 which is not in the HDS on-grid spacing set.</p>
    </div>
  );
}
