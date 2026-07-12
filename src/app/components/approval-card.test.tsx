/**
 * Tests for ApprovalCard — the tasks-store approval inbox card (ops#140).
 *
 * Covers:
 *   - Real task metadata (priority/due/tier/model) renders as pills.
 *   - The dead orchestration-era grill button is gone (no `data-role="grill-button"`).
 *
 * @testing-library/react is not installed; tests use act + createRoot directly.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ApprovalCard, type ApprovalUnitSummary } from './approval-card';

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

const baseUnit: ApprovalUnitSummary = {
  id: 'github:hirobius/ops#140',
  name: 'delete RunsPanel',
  priority: 'high',
  due: '2026-07-20',
  tier: 'mechanical',
  model: 'sonnet',
};

describe('ApprovalCard — task-truth pills', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = makeContainer();
    root = createRoot(container);
  });

  afterEach(() => cleanup(container, root));

  it('renders the priority pill from unit.priority', () => {
    act(() => {
      root.render(<ApprovalCard unit={baseUnit} onApprove={vi.fn()} onDeny={vi.fn()} />);
    });
    const pill = container.querySelector('[data-role="unit-priority"]');
    expect(pill).not.toBeNull();
    expect(pill!.textContent).toBe('HIGH');
  });

  it('renders the due pill from unit.due', () => {
    act(() => {
      root.render(<ApprovalCard unit={baseUnit} onApprove={vi.fn()} onDeny={vi.fn()} />);
    });
    const pill = container.querySelector('[data-role="unit-due"]');
    expect(pill).not.toBeNull();
    expect(pill!.textContent).toBe('due 2026-07-20');
  });

  it('omits the priority pill when unit.priority is absent', () => {
    act(() => {
      root.render(
        <ApprovalCard unit={{ ...baseUnit, priority: null }} onApprove={vi.fn()} onDeny={vi.fn()} />,
      );
    });
    expect(container.querySelector('[data-role="unit-priority"]')).toBeNull();
  });

  it('never renders a grill button — the dead orchestration-era action', () => {
    act(() => {
      root.render(<ApprovalCard unit={baseUnit} onApprove={vi.fn()} onDeny={vi.fn()} />);
    });
    expect(container.querySelector('[data-role="grill-button"]')).toBeNull();
  });
});
