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
import type { Task, TaskAction, TaskActionResult } from './types';
import { taskRef, labelPriority, type LabelPriority } from './taskMeta';
import { copyText } from './clipboard';

const PRIORITIES: LabelPriority[] = ['p0', 'p1', 'p2', 'p3'];

export interface TaskActionsMenuProps {
  task: Task;
  busy: boolean;
  onAction: (
    key: string,
    action: TaskAction,
    payload?: Record<string, unknown>,
  ) => Promise<TaskActionResult>;
}

export function TaskActionsMenu({ task: t, busy, onAction }: TaskActionsMenuProps) {
  const dispatched = !!t.dispatch_url;
  const ref = taskRef(t);
  const ralphReady = (t.tags ?? []).includes('ralph-ready');
  const ralphAuto = (t.tags ?? []).includes('ralph-auto');
  const isGithubTracked = t.key.startsWith('github:');
  const currentPriority = labelPriority(t);

  return (
    <Menu>
      <Menu.Trigger asChild>
        <Button size="sm" variant="secondary" disabled={busy} aria-label="More actions">
          ⋯
        </Button>
      </Menu.Trigger>
      <Menu.Content align="end">
        {t.status !== 'done' && !isGithubTracked && (
          <Menu.Item onSelect={() => onAction(t.key, 'done')}>Mark done</Menu.Item>
        )}
        {ref && <Menu.Item onSelect={() => void copyText(ref)}>Copy {ref}</Menu.Item>}
        {(dispatched || isGithubTracked) && <Menu.Separator />}
        {dispatched && (
          <Menu.Item
            onSelect={() => onAction(t.key, ralphReady ? 'ralph_ready_off' : 'ralph_ready_on')}
            title="Adds/removes the ralph-ready label on the linked GitHub issue — the Ralph loop picks up ralph-ready issues automatically."
          >
            {ralphReady ? 'Ralph-ready: on → turn off' : 'Ralph-ready: off → turn on'}
          </Menu.Item>
        )}
        {isGithubTracked && (
          <Menu.Item
            onSelect={() => onAction(t.key, 'ralph_approve')}
            title="Labels the linked ralph/issue-N PR ralph-approved, arming the ralph-gate workflow's auto-merge."
          >
            Approve merge
          </Menu.Item>
        )}
        {isGithubTracked && (
          <Menu.Item
            onSelect={() => onAction(t.key, ralphAuto ? 'ralph_auto_off' : 'ralph_auto_on')}
            title="Adds/removes the ralph-auto label on the linked GitHub issue — pre-approves the shipped PR's merge with no ralph_approve tap needed."
          >
            {ralphAuto ? 'Auto-merge: on → turn off' : 'Auto-merge: off → turn on'}
          </Menu.Item>
        )}
        {isGithubTracked && (
          <Menu.Sub>
            <Menu.SubTrigger>
              Priority{currentPriority ? `: ${currentPriority.toUpperCase()}` : ''}
            </Menu.SubTrigger>
            <Menu.SubContent>
              <Menu.RadioGroup
                value={currentPriority ?? ''}
                onValueChange={(value) =>
                  onAction(t.key, 'set_priority', { priority: value || null })
                }
              >
                {PRIORITIES.map((p) => (
                  <Menu.RadioItem key={p} value={p}>
                    {p.toUpperCase()}
                  </Menu.RadioItem>
                ))}
                <Menu.Separator />
                <Menu.RadioItem value="">Clear priority</Menu.RadioItem>
              </Menu.RadioGroup>
            </Menu.SubContent>
          </Menu.Sub>
        )}
        <Menu.Separator />
        <Menu.Item onSelect={() => onAction(t.key, 'trash')}>Trash task (soft-delete)</Menu.Item>
      </Menu.Content>
    </Menu>
  );
}
