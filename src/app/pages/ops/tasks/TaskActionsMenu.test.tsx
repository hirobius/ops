/**
 * Tests for TaskActionsMenu — confirm-on-Trash (ops#108).
 *
 * The Trash menu item used to call `onAction(key, 'trash')` directly on
 * click: one mis-tap soft-deleted a task with no way back. These tests pin
 * the confirm gate: onAction only fires once the operator accepts the
 * native confirm() dialog.
 *
 * @hirobius/design-system is mocked out with bare DOM equivalents (Menu.Item
 * → <button onClick>) so the test exercises this component's own wiring
 * rather than Radix's pointer/portal behaviour, which jsdom doesn't fully
 * emulate. @testing-library/react is not installed; tests use act +
 * createRoot directly, matching agentic-os/SkillsBar.test.tsx.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@hirobius/design-system', () => {
  const Menu = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Menu as any).Trigger = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Menu as any).Content = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Menu as any).Item = ({
    onSelect,
    children,
    title,
  }: {
    onSelect?: () => void;
    children: React.ReactNode;
    title?: string;
  }) => (
    <button type="button" title={title} onClick={() => onSelect?.()}>
      {children}
    </button>
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Menu as any).Separator = () => <hr />;

  return {
    Menu,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Button: (props: any) => <button {...props} />,
  };
});

import { TaskActionsMenu } from './TaskActionsMenu';
import type { Task } from './types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '1',
    key: 'github:hirobius/ops#108',
    source: 'github',
    native_key: '108',
    lane: 'ops',
    group: null,
    phase: null,
    title: 'confirm-on-trash',
    status: 'open',
    raw_status: null,
    derived: null,
    stage: null,
    priority: null,
    due: null,
    owner: null,
    effort: null,
    tags: [],
    deps: null,
    blocked_by: null,
    notes: null,
    subtasks: null,
    import_flags: null,
    sort_order: null,
    claimed_by: null,
    claimed_at: null,
    completed_at: null,
    dispatch_url: null,
    source_url: null,
    deleted_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    auto_ok: null,
    tier: null,
    model: null,
    dispatch_status: null,
    dispatch_count: null,
    last_dispatched_at: null,
    ...overrides,
  };
}

function makeContainer(): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  return c;
}

function cleanup(container: HTMLDivElement, root: Root) {
  act(() => {
    root.unmount();
  });
  container.remove();
}

function findTrashButton(container: HTMLDivElement): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('Trash task'),
  );
  if (!btn) throw new Error('Trash menu item not found');
  return btn;
}

describe('TaskActionsMenu — confirm-on-trash', () => {
  let container: HTMLDivElement;
  let root: Root;
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = makeContainer();
    root = createRoot(container);
  });

  afterEach(() => {
    cleanup(container, root);
    confirmSpy?.mockRestore();
  });

  it('does not invoke the trash action when the confirm is dismissed', () => {
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onAction = vi.fn();
    act(() => {
      root.render(<TaskActionsMenu task={makeTask()} busy={false} onAction={onAction} />);
    });
    act(() => {
      findTrashButton(container).click();
    });
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('invokes the trash action only after the confirm is accepted', () => {
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onAction = vi.fn();
    const task = makeTask();
    act(() => {
      root.render(<TaskActionsMenu task={task} busy={false} onAction={onAction} />);
    });
    act(() => {
      findTrashButton(container).click();
    });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(task.key, 'trash');
  });

  it('confirm message names the task so operators know what they are trashing', () => {
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    act(() => {
      root.render(<TaskActionsMenu task={makeTask()} busy={false} onAction={vi.fn()} />);
    });
    act(() => {
      findTrashButton(container).click();
    });
    expect(confirmSpy.mock.calls[0][0]).toMatch(/Trash/i);
    expect(confirmSpy.mock.calls[0][0]).toContain('hirobius/ops#108');
  });

  it('other menu items are unaffected — Mark done still fires with no confirm', () => {
    confirmSpy = vi.spyOn(window, 'confirm');
    const onAction = vi.fn();
    const task = makeTask();
    act(() => {
      root.render(<TaskActionsMenu task={task} busy={false} onAction={onAction} />);
    });
    const markDone = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Mark done'),
    )!;
    act(() => {
      markDone.click();
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onAction).toHaveBeenCalledWith(task.key, 'done');
  });
});
