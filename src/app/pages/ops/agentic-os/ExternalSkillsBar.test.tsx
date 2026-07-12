/**
 * Tests for ExternalSkillsBar — the /ops/skills design-toolkit catalog tiles.
 *
 * Covers:
 *   - all status groups with entries render their group label
 *   - expanding the impeccable tile reveals its invocations
 *   - clicking copy writes the exact command to the clipboard
 *
 * @testing-library/react is not installed; tests use act + createRoot directly
 * (same idiom as SkillsBar.test.tsx).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ExternalSkillsBar } from './ExternalSkillsBar';
import { EXTERNAL_SKILLS, STATUS_LABEL } from './external-skills';

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

describe('ExternalSkillsBar', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = makeContainer();
    root = createRoot(container);
    act(() => {
      root.render(React.createElement(ExternalSkillsBar));
    });
  });

  afterEach(() => {
    cleanup(container, root);
    vi.unstubAllGlobals();
  });

  it('renders a group label for every status that has entries', () => {
    const statuses = new Set(EXTERNAL_SKILLS.map((s) => s.status));
    for (const status of statuses) {
      expect(container.textContent).toContain(STATUS_LABEL[status]);
    }
  });

  it('renders a tile button per catalog entry', () => {
    const tiles = container.querySelectorAll('button[aria-expanded]');
    expect(tiles.length).toBe(EXTERNAL_SKILLS.length);
  });

  it('expanding the impeccable tile reveals its invocations', () => {
    const tile = [...container.querySelectorAll('button[aria-expanded]')].find((b) =>
      b.textContent?.includes('Impeccable'),
    ) as HTMLButtonElement;
    expect(tile).toBeTruthy();

    act(() => {
      tile.click();
    });

    expect(tile.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('/impeccable critique <target>');
    expect(container.textContent).toContain('npx impeccable detect <dir>');
  });

  it('copy writes the exact command to the clipboard', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    const tile = [...container.querySelectorAll('button[aria-expanded]')].find((b) =>
      b.textContent?.includes('Impeccable'),
    ) as HTMLButtonElement;

    act(() => {
      tile.click();
    });

    const copyBtn = [...container.querySelectorAll('button')].find((b) =>
      b.getAttribute('aria-label')?.startsWith('Copy: Review a surface'),
    ) as HTMLButtonElement;
    expect(copyBtn).toBeTruthy();

    await act(async () => {
      copyBtn.click();
    });

    expect(writeText).toHaveBeenCalledWith('/impeccable critique <target>');
    expect(copyBtn.textContent).toBe('copied');
  });
});
