/* hds-bypass: ops-internal overlay. Inline styles intentional for ops dashboard. */

/**
 * OpsCommandPalette — Cmd-K / Ctrl-K modal containing SessionInputForm.
 *
 * Opened from OpsShell's global keyboard handler or the mobile FAB. Renders
 * SessionInputForm inside a Dialog; closes automatically on successful dispatch
 * via onResult. Skip mounting on /ops/sessions (already has SessionInputForm inline).
 *
 * @category Internal
 * @tier utility
 */

import React, { useCallback } from 'react';
import { Dialog } from '@hirobius/design-system';
import { CLIENT_SLUGS } from './clientRegistry';
import { SessionInputForm } from './SessionInputForm';
import type { AssignerResult } from './SessionInputForm';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OpsCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

const DEFAULT_CLIENT = CLIENT_SLUGS.includes('lilac-insure')
  ? 'lilac-insure'
  : (CLIENT_SLUGS[0] ?? '');

/** @public */
export function OpsCommandPalette({ open, onOpenChange }: OpsCommandPaletteProps) {
  const handleResult = useCallback(
    (_result: AssignerResult) => {
      onOpenChange(false);
    },
    [onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content aria-describedby={undefined}>
        <Dialog.Header>
          <Dialog.Title>Dispatch task</Dialog.Title>
        </Dialog.Header>
        <SessionInputForm
          clients={CLIENT_SLUGS}
          defaultClient={DEFAULT_CLIENT}
          onResult={handleResult}
        />
      </Dialog.Content>
    </Dialog>
  );
}

// Re-export so OpsShell and other callers share the type.
export type { AssignerResult };
