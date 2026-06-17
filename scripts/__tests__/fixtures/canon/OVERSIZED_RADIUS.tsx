/** Canon fixture: OVERSIZED_RADIUS — triggers rounded-full on a structural element */
import React from 'react';

export function OversizedRadiusFixture() {
  return (
    <div>
      {/* Card present so fileNearStructural returns true */}
      <Card className="rounded-full p-6">
        <p>This card uses rounded-full which is an oversized radius.</p>
      </Card>
    </div>
  );
}
