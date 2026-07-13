/* hds-bypass: ops-internal page. Inline styles intentional for ops dashboard. */

/**
 * TaskActionsMenu — the governed per-row action menu (ops#136).
 *
 * DS Menu (Radix dropdown) replaces the hand-rolled popover: keyboard nav,
 * ESC/outside-click dismissal, and portal mounting come for free. Everything
 * except the row's one primary action lives here, so a row shows at most
 * title · chips · primary · ⋯.
 *
 * Every item funnels through `runAction`, which reports its outcome via
 * `onNotify` (ops#108: no menu action fails silently). Trash additionally
 * requires a native confirm naming the task — one mis-tap on a densely
 * packed ⋯ menu shouldn't soft-delete a task.
 */

import { Button, Menu } from '@hirobius/design-system';
import type { Task, TaskAction, TaskActionResult } from './types';
import { taskRef, labelPriority, describeTaskActionOutcome, type LabelPriority } from './taskMeta';
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
  /** Reports an action's outcome — never fails silently (ops#108). */
  onNotify: (message: string, tone: 'success' | 'danger') => void;
}

export function TaskActionsMenu({ task: t, busy, onAction, onNotify }: TaskActionsMenuProps) {
  const dispatched = !!t.dispatch_url;
  const ref = taskRef(t);
  const ralphReady = (t.tags ?? []).includes('ralph-ready');
  const ralphAuto = (t.tags ?? []).includes('ralph-auto');
  const isGithubTracked = t.key.startsWith('github:');
  const currentPriority = labelPriority(t);

  async function runAction(action: TaskAction, payload?: Record<string, unknown>) {
    const result = await onAction(t.key, action, payload);
    const { text, tone } = describeTaskActionOutcome(action, result);
    onNotify(text, tone);
  }

  function handleTrash() {
    const proceed = window.confirm(
      `Trash ${ref ?? t.title}? This soft-deletes the task — it can be restored later.`,
    );
    if (!proceed) return;
    void runAction('trash');
  }

  return (
    <Menu>
      <Menu.Trigger asChild>
        <Button size="sm" variant="secondary" disabled={busy} aria-label="More actions">
          ⋯
        </Button>
      </Menu.Trigger>
      <Menu.Content align="end">
        {t.status !== 'done' && (
          <Menu.Item onSelect={() => void runAction('done')}>Mark done</Menu.Item>
        )}
        {ref && <Menu.Item onSelect={() => void copyText(ref)}>Copy {ref}</Menu.Item>}
        <Menu.Separator />
        <Menu.Item onSelect={() => void runAction(t.auto_ok ? 'auto_off' : 'auto_on')}>
          {t.auto_ok ? 'Auto-dispatch: on → turn off' : 'Auto-dispatch: off → turn on'}
        </Menu.Item>
        {!dispatched && (
          <Menu.Item
            onSelect={() => void runAction(t.dispatch_status === 'queued' ? 'unqueue' : 'queue')}
          >
            {t.dispatch_status === 'queued' ? 'Remove from approvals queue' : 'Queue for approval'}
          </Menu.Item>
        )}
        {dispatched && (
          <Menu.Item
            onSelect={() => void runAction(ralphReady ? 'ralph_ready_off' : 'ralph_ready_on')}
            title="Adds/removes the ralph-ready label on the linked GitHub issue — the Ralph loop picks up ralph-ready issues automatically."
          >
            {ralphReady ? 'Ralph-ready: on → turn off' : 'Ralph-ready: off → turn on'}
          </Menu.Item>
        )}
        {isGithubTracked && (
          <Menu.Item
            onSelect={() => void runAction('ralph_approve')}
            title="Labels the linked ralph/issue-N PR ralph-approved, arming the ralph-gate workflow's auto-merge."
          >
            Approve merge
          </Menu.Item>
        )}
        {isGithubTracked && (
          <Menu.Item
            onSelect={() => void runAction(ralphAuto ? 'ralph_auto_off' : 'ralph_auto_on')}
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
                onValueChange={(value) => void runAction('set_priority', { priority: value || null })}
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
        <Menu.Item onSelect={handleTrash}>Trash task (soft-delete)</Menu.Item>
      </Menu.Content>
    </Menu>
  );
}
