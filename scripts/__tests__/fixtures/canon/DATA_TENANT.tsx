/** Canon fixture: DATA_TENANT — triggers [data-tenant=...] selector outside tokens.css */
import React from 'react';

export function DataTenantFixture() {
  return (
    // This component uses [data-tenant=...] which should only live in tokens.css
    <div data-tenant="acme" className="p-4">
      <p>Tenant-scoped content using a selector that bypasses the token system.</p>
    </div>
  );
}

// Inline selector reference that triggers the rule:
const styles = `[data-tenant=acme] .title { color: red; }`;
