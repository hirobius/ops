/**
 * Tests for TaskRow's primary-action inline feedback (ops#108): a failed
 * Dispatch/Reopen must report through onNotify, not fail silently until the
 * next poll.
 *
 * @hirobius/design-system is mocked to bare DOM equivalents — see
 * TaskActionsMenu.test.tsx for why (Radix Menu isn't reliably driveable in
 * jsdom without @testing-library/user-event, which isn't installed).
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
  const Badge = ({ children }: any) => <span>{children}</span>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Card = ({ children, ...rest }: any) => <div {...rest}>{children}</div>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Card.Header = ({ children, metadata }: any) => (
    <div>
      {metadata}
      {children}
    </div>
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Card.Title = ({ children }: any) => <div>{children}</div>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Card.Footer = ({ children }: any) => <div>{children}</div>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Cluster = ({ children }: any) => <div>{children}</div>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Menu = ({ children }: any) => <div>{children}</div>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Menu.Trigger = ({ children }: any) => <>{children}</>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Menu.Content = ({ children }: any) => <div>{children}</div>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Menu.Item = ({ children, onSelect }: any) => (
    <button type="button" onClick={() => onSelect?.()}>
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
  return { Button, Badge, Card, Cluster, Menu };
});

import { TaskRow } from './TaskRow';
import type { Task, TaskActionResult } from './types';

function task(overrides: Partial<Task>): Task {
  return {
    id: 'x',
    key: 'tracker:x',
    source: 'tracker',
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

describe('TaskRow — primary action inline feedback (ops#108)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = makeContainer();
    root = createRoot(container);
  });

  afterEach(() => cleanup(container, root));

  it('reports a failed Dispatch via onNotify instead of failing silently', async () => {
    const onAction = vi
      .fn()
      .mockResolvedValue({ ok: false, body: { error: 'no repo access' } } satisfies TaskActionResult);
    const onNotify = vi.fn();
    const t = task({ status: 'open', dispatch_url: null });
    act(() => {
      root.render(
        <TaskRow
          task={t}
          busy={false}
          isSelected={false}
          onToggleSelect={vi.fn()}
          onAction={onAction}
          onNotify={onNotify}
        />,
      );
    });
    const dispatchBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Dispatch',
    )!;
    await act(async () => {
      dispatchBtn.click();
      await Promise.resolve();
    });
    expect(onAction).toHaveBeenCalledWith(t.key, 'dispatch');
    expect(onNotify).toHaveBeenCalledWith('Dispatched failed: no repo access', 'danger');
  });

  it('reports a successful Reopen via onNotify', async () => {
    const onAction = vi.fn().mockResolvedValue({ ok: true, body: null } satisfies TaskActionResult);
    const onNotify = vi.fn();
    const t = task({ status: 'done' });
    act(() => {
      root.render(
        <TaskRow
          task={t}
          busy={false}
          isSelected={false}
          onToggleSelect={vi.fn()}
          onAction={onAction}
          onNotify={onNotify}
        />,
      );
    });
    const reopenBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Reopen',
    )!;
    await act(async () => {
      reopenBtn.click();
      await Promise.resolve();
    });
    expect(onAction).toHaveBeenCalledWith(t.key, 'reopen');
    expect(onNotify).toHaveBeenCalledWith('Reopened.', 'success');
  });
});
