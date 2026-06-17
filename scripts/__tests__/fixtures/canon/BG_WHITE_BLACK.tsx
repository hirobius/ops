/** Canon fixture: BG_WHITE_BLACK — triggers bg-white className rule */
import React from 'react';

export function BgWhiteFixture() {
  return (
    <div className="bg-white p-4">
      <p>This surface uses bg-white instead of a semantic token.</p>
    </div>
  );
}
