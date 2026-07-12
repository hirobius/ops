/**
 * Tests for TaskRow — inline action-error feedback (ops#108).
 *
 * useTaskActions.act() used to swallow a failed mutation silently (a bare
 * catch commented "surfaced on next poll"); a row gave no indication
 * anything went wrong until the next background poll, if ever. TaskRow now
 * renders its `error` prop (set by useTaskActions on a failed action) as a
 * `role="alert"` line.
 *
 * @hirobius/design-system is mocked out with bare DOM equivalents so the
 * test exercises TaskRow's own render logic rather than the DS/Radix
 * internals. @testing-library/react is not installed; tests use act +
 * createRoot directly, matching agentic-os/SkillsBar.test.tsx.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@hirobius/design-system', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Card: any = ({
    as: As = 'div',
    children,
    style,
  }: {
    as?: string;
    children?: React.ReactNode;
    style?: React.CSSProperties;
  }) => React.createElement(As, { style }, children);
  Card.Header = ({
    children,
    metadata,
  }: {
    children?: React.ReactNode;
    metadata?: React.ReactNode;
  }) => (
    <div>
      {metadata}
      {children}
    </div>
  );
  Card.Title = ({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) => (
    <h3 style={style}>{children}</h3>
  );
  Card.Footer = ({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) => (
    <div style={style}>{children}</div>
  );
  Card.Body = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Menu: any = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Menu.Trigger = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  Menu.Content = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Menu.Item = ({ onSelect, children }: { onSelect?: () => void; children: React.ReactNode }) => (
    <button type="button" onClick={() => onSelect?.()}>
      {children}
    </button>
  );
  Menu.Separator = () => <hr />;

  return {
    Card,
    Menu,
    Badge: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Button: (props: any) => <button {...props} />,
    Cluster: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  };
});

import { TaskRow } from './TaskRow';
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
    title: 'inline action feedback',
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

describe('TaskRow — inline action-error feedback', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = makeContainer();
    root = createRoot(container);
  });

  afterEach(() => cleanup(container, root));

  it('renders no alert when the row has no error', () => {
    act(() => {
      root.render(
        <TaskRow
          task={makeTask()}
          busy={false}
          isSelected={false}
          onToggleSelect={vi.fn()}
          onAction={vi.fn()}
        />,
      );
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('renders the failure message inline when act() surfaces an error', () => {
    act(() => {
      root.render(
        <TaskRow
          task={makeTask()}
          busy={false}
          isSelected={false}
          error="Dispatched failed: HTTP 500"
          onToggleSelect={vi.fn()}
          onAction={vi.fn()}
        />,
      );
    });
    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toBe('Dispatched failed: HTTP 500');
  });
});
