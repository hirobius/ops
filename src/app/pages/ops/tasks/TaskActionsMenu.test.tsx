/**
 * Tests for TaskActionsMenu (ops#108): confirm-before-trash + inline
 * action feedback via onNotify.
 *
 * @hirobius/design-system's Menu is Radix-backed (pointer/portal open state
 * isn't reliably driveable in jsdom without @testing-library/user-event,
 * which isn't installed), so it's mocked to bare DOM equivalents that always
 * render Menu.Content — matching the SkillsBar.test.tsx convention of
 * act + createRoot directly (@testing-library/react isn't installed either).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@hirobius/design-system', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Button = ({ children, onClick, disabled, ...rest }: any) => (
    <button type="button" onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Menu = ({ children }: any) => <div>{children}</div>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Menu.Trigger = ({ children }: any) => <>{children}</>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Menu.Content = ({ children }: any) => <div data-testid="menu-content">{children}</div>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Menu.Item = ({ children, onSelect, title }: any) => (
    <button type="button" title={title} onClick={() => onSelect?.()}>
      {children}
    </button>
  );
  Menu.Separator = () => <hr />;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Menu.Sub = ({ children }: any) => <div>{children}</div>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Menu.SubTrigger = ({ children }: any) => <div>{children}</div>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Menu.SubContent = ({ children }: any) => <div>{children}</div>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Menu.RadioGroup = ({ children }: any) => <div>{children}</div>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Menu.RadioItem = ({ children, value, onValueChange }: any) => (
    <button type="button" onClick={() => onValueChange?.(value)}>
      {children}
    </button>
  );
  return { Button, Menu };
});

import { TaskActionsMenu } from './TaskActionsMenu';
import type { Task, TaskActionResult } from './types';

function task(overrides: Partial<Task>): Task {
  return {
    id: 'x',
    key: 'github:hirobius/ops#108',
    source: 'github:hirobius/ops',
    native_key: null,
    lane: 'ops',
    group: null,
    phase: null,
    title: 'a task',
    status: 'open',
    raw_status: null,
    derived: null,
    stage: null,
    priority: null,
    due: null,
    owner: null,
    effort: null,
    tags: null,
    deps: null,
    blocked_by: null,
    notes: null,
    subtasks: null,
    import_flags: null,
    sort_order: null,
    claimed_by: null,
    claimed_at: null,
    completed_at: null,
    dispatch_url: 'https://github.com/hirobius/ops/issues/108',
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

function findButton(container: HTMLDivElement, text: string): HTMLButtonElement {
  const btn = [...container.querySelectorAll('button')].find((b) =>
    b.textContent?.includes(text),
  );
  if (!btn) throw new Error(`no button found containing "${text}"`);
  return btn as HTMLButtonElement;
}

describe('TaskActionsMenu — confirm-on-trash (ops#108)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = makeContainer();
    root = createRoot(container);
    confirmSpy = vi.spyOn(window, 'confirm');
  });

  afterEach(() => {
    cleanup(container, root);
    confirmSpy.mockRestore();
  });

  it('does NOT invoke the trash action when the user cancels the confirm', () => {
    confirmSpy.mockReturnValue(false);
    const onAction = vi.fn<(...args: unknown[]) => Promise<TaskActionResult>>();
    const onNotify = vi.fn();
    act(() => {
      root.render(
        <TaskActionsMenu task={task({})} busy={false} onAction={onAction} onNotify={onNotify} />,
      );
    });
    act(() => {
      findButton(container, 'Trash task').click();
    });
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalled();
    expect(onNotify).not.toHaveBeenCalled();
  });

  it('invokes the trash action and reports success once the user confirms', async () => {
    confirmSpy.mockReturnValue(true);
    const onAction = vi.fn().mockResolvedValue({ ok: true, body: null } satisfies TaskActionResult);
    const onNotify = vi.fn();
    const t = task({});
    act(() => {
      root.render(<TaskActionsMenu task={t} busy={false} onAction={onAction} onNotify={onNotify} />);
    });
    await act(async () => {
      findButton(container, 'Trash task').click();
      await Promise.resolve();
    });
    expect(onAction).toHaveBeenCalledWith(t.key, 'trash', undefined);
    expect(onNotify).toHaveBeenCalledWith('Trashed.', 'success');
  });
});

describe('TaskActionsMenu — inline action feedback (ops#108)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = makeContainer();
    root = createRoot(container);
  });

  afterEach(() => cleanup(container, root));

  it('reports a failed non-trash action via onNotify with the server error', async () => {
    const onAction = vi
      .fn()
      .mockResolvedValue({ ok: false, body: { error: 'label API rate-limited' } } satisfies TaskActionResult);
    const onNotify = vi.fn();
    const t = task({});
    act(() => {
      root.render(<TaskActionsMenu task={t} busy={false} onAction={onAction} onNotify={onNotify} />);
    });
    await act(async () => {
      findButton(container, 'Mark done').click();
      await Promise.resolve();
    });
    expect(onAction).toHaveBeenCalledWith(t.key, 'done', undefined);
    expect(onNotify).toHaveBeenCalledWith('Marked done failed: label API rate-limited', 'danger');
  });

  it('reports a successful set_priority action via onNotify', async () => {
    const onAction = vi.fn().mockResolvedValue({ ok: true, body: null } satisfies TaskActionResult);
    const onNotify = vi.fn();
    const t = task({});
    act(() => {
      root.render(<TaskActionsMenu task={t} busy={false} onAction={onAction} onNotify={onNotify} />);
    });
    await act(async () => {
      findButton(container, 'P0').click();
      await Promise.resolve();
    });
    expect(onAction).toHaveBeenCalledWith(t.key, 'set_priority', { priority: 'p0' });
    expect(onNotify).toHaveBeenCalledWith('Priority updated.', 'success');
  });
});
