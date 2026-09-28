/**
 * LeadSweepPanel — guards the HDS migration (ops#425): a labelled region with
 * three labelled fields (saved sweep, count/pair, cap/run), a preset that
 * expands into a region/area checklist, the over-cap guard that disables
 * "Run selected", the explicit confirm step, one POST per selected pair, and
 * the "Sourced" summary row that follows.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const post = vi.fn();
vi.mock('../../../lib/opsApi', () => ({
  opsApi: { post: (url: string, body: unknown) => post(url, body) },
}));

import { LeadSweepPanel } from './LeadSweepPanel';
import { PRESETS, PRESET_NAMES } from './sweepPresets';

let container: HTMLDivElement;
let root: Root;
const onInserted = vi.fn();

function field<T extends Element>(label: string, selector: string): T {
  const el = Array.from(container.querySelectorAll('label')).find((l) =>
    l.textContent?.startsWith(label),
  );
  const control = el?.querySelector(selector) ?? null;
  if (!control) throw new Error(`no ${selector} labelled ${label}`);
  return control as T;
}

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value')!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }),
    );
  });
}

function button(name: string): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.trim().startsWith(name),
  );
  if (!btn) throw new Error(`no button ${name}`);
  return btn;
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
}

const firstPreset = PRESET_NAMES[0];

beforeEach(() => {
  post.mockReset();
  onInserted.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<LeadSweepPanel onInserted={onInserted} />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('LeadSweepPanel', () => {
  it('renders a labelled region with three labelled fields and no checklist yet', () => {
    expect(container.querySelector('section[aria-label="Saved lead sweeps"]')).not.toBeNull();
    expect(field('Saved sweep', 'select')).toBeTruthy();
    expect(field<HTMLInputElement>('Count / pair', 'input').value).toBe('5');
    expect(field<HTMLInputElement>('Cap / run', 'input').value).toBe('120');
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(0);
    expect(container.textContent).not.toContain('Run selected');
  });

  it('expands a preset into its region/area checklist with a bounded pre-selected sample', () => {
    setValue(field('Saved sweep', 'select'), firstPreset);
    const preset = PRESETS[firstPreset];
    expect(container.textContent).toContain(preset.metros[0].region);
    expect(container.textContent).toContain(preset.metros[0].areas[0]);
    const total = preset.metros.reduce((n, m) => n + m.areas.length, 0) * preset.keywords.length;
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(total);
    const checked = container.querySelectorAll('input[type="checkbox"]:checked').length;
    expect(checked).toBeGreaterThan(0);
    expect(checked * 5).toBeLessThanOrEqual(120);
    expect(container.textContent).toContain(`${checked} of ${total} pairs selected`);
  });

  it('disables Run selected and warns when the estimate exceeds the cap', () => {
    setValue(field('Saved sweep', 'select'), firstPreset);
    setValue(field('Count / pair', 'input'), '50');
    expect(button('Run selected').disabled).toBe(true);
    expect(container.textContent).toContain('exceeds the 120/run cap');
  });

  it('confirms before firing, then POSTs once per selected pair and reports the total', async () => {
    post.mockResolvedValue({ ok: true, json: async () => ({ inserted: 3 }) });
    setValue(field('Saved sweep', 'select'), firstPreset);
    await click(button('Clear'));
    const boxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    await click(boxes[0]);
    await click(boxes[1]);

    await click(button('Run selected'));
    expect(post).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Confirm: run 2 pairs');

    await click(button('Confirm run'));
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0][0]).toBe('/api/pull-leads');
    expect(post.mock.calls[0][1]).toMatchObject({ count: 5 });
    expect(container.textContent).toContain('Sourced');
    expect(container.textContent).toContain('6 leads upserted across 2 pairs');
    expect(onInserted).toHaveBeenCalledWith(6);
  });
});
