/* hds-bypass: ops-internal layout. Inline styles intentional for ops dashboard. */

/**
 * OpsShell — parent layout for all /ops/* routes.
 *
 * Mounts the global Cmd-K / Ctrl-K handler and the mobile FAB that open
 * OpsCommandPalette (SessionInputForm in a Dialog). Skips mounting the
 * handler when the current path is /ops/sessions — that page already has
 * SessionInputForm inline.
 *
 * @category Internal
 * @tier utility
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router';
import { MessageSquarePlus } from 'lucide-react';
import { IconButton } from '@hirobius/design-system';
import { OpsCommandPalette } from './OpsCommandPalette';

// ── Component ─────────────────────────────────────────────────────────────────

/** @public */
export function OpsShell() {
  const [open, setOpen] = useState(false);
  const { pathname }    = useLocation();

  // Skip attaching the handler on the sessions page (form already inline).
  const isSessionsPage = pathname.startsWith('/ops/sessions');

  const handleOpen = useCallback(() => {
    if (!isSessionsPage) setOpen(true);
  }, [isSessionsPage]);

  // Global Cmd-K / Ctrl-K toggle.
  useEffect(() => {
    if (isSessionsPage) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSessionsPage]);

  return (
    <>
      <Outlet />

      {/* Global Cmd-K / Ctrl-K modal */}
      <OpsCommandPalette open={open} onOpenChange={setOpen} />

      {/* Mobile FAB — hidden at sm (≥640px) breakpoint via Tailwind */}
      {!isSessionsPage && (
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
      )}
    </>
  );
}
