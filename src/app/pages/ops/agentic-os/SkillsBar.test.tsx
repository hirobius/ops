/**
 * Tests for SkillTile — the SkillsBar tile component, with focus on the
 * input-shell variant (Refs: t_554cd532 / dashbd-skillsbar-input-shell).
 *
 * Covers:
 *   - Skills without `input` render just the fire button (regression guard).
 *   - Skills with `input` render the appropriate control per kind:
 *       text → <textarea>, url → <input type="url">,
 *       slug → <input type="text">, file → <input type="file">.
 *   - Fire button is disabled until the input has a non-empty value.
 *   - Clicking the button calls onRun(id, value).
 *
 * @testing-library/react is not installed; tests use act + createRoot directly.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SkillTile } from './SkillsBar';
import type { SkillSpec } from './skills';

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

const idleState = { kind: 'idle' as const };

// A bare SkillSpec the tile is happy to render.
const baseSpec: SkillSpec = {
  id: 'strength',
  label: 'Strength',
  hint: 'regenerate Score A + B',
  group: 'Ops',
  showJsonResult: false,
};

describe('SkillTile — no input', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = makeContainer();
    root = createRoot(container);
  });

  afterEach(() => cleanup(container, root));

  it('renders just the fire button (no input control)', () => {
    const onRun = vi.fn();
    act(() => {
      root.render(<SkillTile skill={baseSpec} state={idleState} onRun={onRun} />);
    });
    expect(container.querySelector('button')).not.toBeNull();
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('fires onRun(id) with no input arg when clicked', () => {
    const onRun = vi.fn();
    act(() => {
      root.render(<SkillTile skill={baseSpec} state={idleState} onRun={onRun} />);
    });
    const btn = container.querySelector('button')!;
    expect(btn.disabled).toBe(false);
    act(() => {
      btn.click();
    });
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onRun).toHaveBeenCalledWith('strength', undefined);
  });
});

describe('SkillTile — text input variant', () => {
  let container: HTMLDivElement;
  let root: Root;

  const spec: SkillSpec = {
    id: 'strength', // re-use existing id so types line up
    label: 'Rambler',
    hint: 'paste a rant',
    group: 'Knowledge',
    showJsonResult: false,
    input: { kind: 'text', label: 'Rant', placeholder: 'paste here…' },
  };

  beforeEach(() => {
    container = makeContainer();
    root = createRoot(container);
  });

  afterEach(() => cleanup(container, root));

  it('renders a textarea labelled by skill.input.label', () => {
    act(() => {
      root.render(<SkillTile skill={spec} state={idleState} onRun={vi.fn()} />);
    });
    const ta = container.querySelector('textarea')!;
    expect(ta).not.toBeNull();
    expect(ta.getAttribute('aria-label')).toBe('Rant');
    expect(ta.getAttribute('placeholder')).toBe('paste here…');
  });

  it('disables the fire button while the textarea is empty', () => {
    act(() => {
      root.render(<SkillTile skill={spec} state={idleState} onRun={vi.fn()} />);
    });
    const btn = container.querySelector('button')!;
    expect(btn.disabled).toBe(true);
  });

  it('enables the button and passes the value to onRun after typing', () => {
    const onRun = vi.fn();
    act(() => {
      root.render(<SkillTile skill={spec} state={idleState} onRun={onRun} />);
    });
    const ta = container.querySelector('textarea')!;
    act(() => {
      // jsdom + React: assign value then fire change event for controlled input.
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )!.set!;
      setter.call(ta, 'hello world');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const btn = container.querySelector('button')!;
    expect(btn.disabled).toBe(false);
    act(() => {
      btn.click();
    });
    expect(onRun).toHaveBeenCalledWith('strength', 'hello world');
  });
});

describe('SkillTile — url input variant', () => {
  let container: HTMLDivElement;
  let root: Root;

  const spec: SkillSpec = {
    id: 'strength',
    label: 'Page clone',
    hint: 'clone a public page',
    group: 'Build',
    showJsonResult: false,
    input: { kind: 'url', label: 'Page URL', placeholder: 'https://…' },
  };

  beforeEach(() => {
    container = makeContainer();
    root = createRoot(container);
  });

  afterEach(() => cleanup(container, root));

  it('renders <input type="url">', () => {
    act(() => {
      root.render(<SkillTile skill={spec} state={idleState} onRun={vi.fn()} />);
    });
    const url = container.querySelector('input[type="url"]') as HTMLInputElement;
    expect(url).not.toBeNull();
    expect(url.getAttribute('aria-label')).toBe('Page URL');
  });
});

describe('SkillTile — slug input variant', () => {
  let container: HTMLDivElement;
  let root: Root;

  const spec: SkillSpec = {
    id: 'strength',
    label: 'Send digest',
    hint: 'pick a client',
    group: 'Ops',
    showJsonResult: false,
    input: { kind: 'slug', label: 'Client slug', placeholder: 'lilac-insure' },
  };

  beforeEach(() => {
    container = makeContainer();
    root = createRoot(container);
  });

  afterEach(() => cleanup(container, root));

  it('renders a single-line text input (not a textarea)', () => {
    act(() => {
      root.render(<SkillTile skill={spec} state={idleState} onRun={vi.fn()} />);
    });
    expect(container.querySelector('input[type="text"]')).not.toBeNull();
    expect(container.querySelector('textarea')).toBeNull();
  });
});

describe('SkillTile — file input variant', () => {
  let container: HTMLDivElement;
  let root: Root;

  const spec: SkillSpec = {
    id: 'strength',
    label: 'Meeting → tasks',
    hint: 'parse transcript',
    group: 'Knowledge',
    showJsonResult: false,
    input: { kind: 'file', label: 'Transcript', placeholder: '' },
  };

  beforeEach(() => {
    container = makeContainer();
    root = createRoot(container);
  });

  afterEach(() => cleanup(container, root));

  it('renders <input type="file"> and disables button until a file is chosen', () => {
    act(() => {
      root.render(<SkillTile skill={spec} state={idleState} onRun={vi.fn()} />);
    });
    const file = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(file).not.toBeNull();
    const btn = container.querySelector('button')!;
    expect(btn.disabled).toBe(true);
  });
});
