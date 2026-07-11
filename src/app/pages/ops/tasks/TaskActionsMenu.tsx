/* hds-bypass: ops-internal page. Inline styles intentional for ops dashboard. */

/**
 * TaskActionsMenu — the governed per-row action menu (ops#136).
 *
 * DS Menu (Radix dropdown) replaces the hand-rolled popover: keyboard nav,
 * ESC/outside-click dismissal, and portal mounting come for free. Everything
 * except the row's one primary action lives here, so a row shows at most
 * title · chips · primary · ⋯.
 */

import { Button, Menu } from '@hirobius/design-system';
import type { Task, TaskAction } from './types';
import { taskRef } from './taskMeta';
import { copyText } from './clipboard';

export interface TaskActionsMenuProps {
  task: Task;
  busy: boolean;
  onAction: (key: string, action: TaskAction) => void;
}

export function TaskActionsMenu({ task: t, busy, onAction }: TaskActionsMenuProps) {
  const dispatched = !!t.dispatch_url;
  const ref = taskRef(t);
  const ralphReady = (t.tags ?? []).includes('ralph-ready');

  return (
    <Menu>
      <Menu.Trigger asChild>
        <Button size="sm" variant="secondary" disabled={busy} aria-label="More actions">
          ⋯
        </Button>
      </Menu.Trigger>
      <Menu.Content align="end">
        {t.status !== 'done' && (
          <Menu.Item onSelect={() => onAction(t.key, 'done')}>Mark done</Menu.Item>
        )}
        {ref && (
          <Menu.Item onSelect={() => void copyText(ref)}>Copy {ref}</Menu.Item>
        )}
        <Menu.Separator />
        <Menu.Item onSelect={() => onAction(t.key, t.auto_ok ? 'auto_off' : 'auto_on')}>
          {t.auto_ok ? 'Auto-dispatch: on → turn off' : 'Auto-dispatch: off → turn on'}
        </Menu.Item>
        {!dispatched && (
          <Menu.Item
            onSelect={() => onAction(t.key, t.dispatch_status === 'queued' ? 'unqueue' : 'queue')}
          >
            {t.dispatch_status === 'queued' ? 'Remove from approvals queue' : 'Queue for approval'}
          </Menu.Item>
        )}
        {dispatched && (
          <Menu.Item
            onSelect={() => onAction(t.key, ralphReady ? 'ralph_ready_off' : 'ralph_ready_on')}
            title="Adds/removes the ralph-ready label on the linked GitHub issue — the Ralph loop picks up ralph-ready issues automatically."
          >
            {ralphReady ? 'Ralph-ready: on → turn off' : 'Ralph-ready: off → turn on'}
          </Menu.Item>
        )}
        <Menu.Separator />
        <Menu.Item onSelect={() => onAction(t.key, 'trash')}>Trash task (soft-delete)</Menu.Item>
      </Menu.Content>
    </Menu>
  );
}
