/* hds-bypass: ops-internal layout. Inline styles intentional for ops dashboard. */

/**
 * OpsShell — parent layout for all /ops/* routes.
 *
 * Mounts the global Cmd-K / Ctrl-K handler and the mobile FAB that open
 * OpsCommandPalette (SessionInputForm in a Dialog).
 *
 * @category Internal
 * @tier utility
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Outlet } from 'react-router';
import { MessageSquarePlus } from 'lucide-react';
import { IconButton } from '@hirobius/design-system';
import { OpsCommandPalette } from './OpsCommandPalette';

// ── Component ─────────────────────────────────────────────────────────────────

/** @public */
export function OpsShell() {
  const [open, setOpen] = useState(false);

  const handleOpen = useCallback(() => setOpen(true), []);

  // Global Cmd-K / Ctrl-K toggle.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      {/* `<main>` landmark: the routed dashboard content. Serves a11y (a named
          main region) AND the layout-integrity auditor, which scopes its
          collision/overflow/stretch checks to `document.querySelector('main')`
          — without this landmark the auditor early-returns and those checks
          are vacuous on every /ops route (BS1c). The Cmd-K modal and FAB are
          fixed-position overlays and stay outside main by design. */}
      <main>
        <Outlet />
      </main>

      {/* Global Cmd-K / Ctrl-K modal */}
      <OpsCommandPalette open={open} onOpenChange={setOpen} />

      {/* Mobile FAB — hidden at sm (≥640px) breakpoint via Tailwind */}
      <div
        className="sm:hidden"
        style={{ position: 'fixed', bottom: '16px', right: '16px', zIndex: 40 }} // spacing-ok: fixed FAB viewport anchor
      >
        <IconButton
          icon={MessageSquarePlus}
          label="Dispatch task (Cmd-K)"
          variant="primary"
          size="lg"
          onClick={handleOpen}
        />
      </div>
    </>
  );
}
