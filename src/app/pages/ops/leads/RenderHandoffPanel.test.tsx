/**
 * Tests for RenderHandoffPanel — the render-action hand-off block (ops#185).
 * Covers: both artifacts render, and dismiss fires onDismiss.
 *
 * @testing-library/react is not installed; tests use act + createRoot directly
 * (matches agentic-os/SkillsBar.test.tsx).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RenderHandoffPanel } from './RenderHandoffPanel';

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

describe('RenderHandoffPanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = makeContainer();
    root = createRoot(container);
  });

  afterEach(() => cleanup(container, root));

  it('renders the config file and commands as code blocks', () => {
    act(() => {
      root.render(
        <RenderHandoffPanel
          configFile="export default defineClient({});"
          commands="pnpm new-client acme"
          onDismiss={vi.fn()}
        />,
      );
    });
    expect(container.textContent).toContain('defineClient');
    expect(container.textContent).toContain('pnpm new-client acme');
  });

  it('calls onDismiss when the Dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    act(() => {
      root.render(<RenderHandoffPanel configFile="x" commands="y" onDismiss={onDismiss} />);
    });
    const dismiss = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Dismiss',
    )!;
    expect(dismiss).not.toBeUndefined();
    act(() => {
      dismiss.click();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
