/** Canon fixture: PURPLE_INDIGO — triggers purple Tailwind utility class rule */
import React from 'react';

export function PurpleIndigoFixture() {
  return (
    <div className="bg-purple-500 text-white p-4">
      <p>This uses a purple palette class outside the HDS colour system.</p>
    </div>
  );
}
