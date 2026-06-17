/** Canon fixture: GRADIENT — triggers bg-gradient Tailwind class rule */
import React from 'react';

export function GradientFixture() {
  return (
    <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-4">
      <p>This surface uses a gradient instead of a flat HDS surface token.</p>
    </div>
  );
}
