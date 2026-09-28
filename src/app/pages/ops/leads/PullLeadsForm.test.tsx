/**
 * PullLeadsForm — guards the HDS migration (ops#425): three labelled fields
 * (niche, metro, count), a submit that stays disabled until niche + metro are
 * filled, a POST to /api/pull-leads with the trimmed values, and the
 * "Sourced" / "Error" status rows that follow.
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

import { PullLeadsForm } from './PullLeadsForm';

let container: HTMLDivElement;
let root: Root;
const onInserted = vi.fn();

function input(label: string): HTMLInputElement {
  const el = Array.from(container.querySelectorAll('label')).find((l) =>
    l.textContent?.startsWith(label),
  );
  const inp = el?.querySelector('input') ?? null;
  if (!inp) throw new Error(`no input labelled ${label}`);
  return inp;
}

function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function submitButton(): HTMLButtonElement {
  const btn = container.querySelector('button[type="submit"]');
  if (!btn) throw new Error('no submit button');
  return btn as HTMLButtonElement;
}

async function submit() {
  await act(async () => {
    submitButton().click();
  });
}

beforeEach(() => {
  post.mockReset();
  onInserted.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<PullLeadsForm onInserted={onInserted} />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('PullLeadsForm', () => {
  it('renders labelled niche, metro and count fields inside a form', () => {
    expect(container.querySelector('form')).not.toBeNull();
    expect(input('Niche').placeholder).toBe('e.g. roofers');
    expect(input('Metro').placeholder).toBe('e.g. Austin, TX');
    expect(input('Count').type).toBe('number');
    expect(input('Count').value).toBe('20');
  });

  it('keeps submit disabled until niche and metro are filled', () => {
    expect(submitButton().disabled).toBe(true);
    type(input('Niche'), 'roofers');
    expect(submitButton().disabled).toBe(true);
    type(input('Metro'), 'Austin, TX');
    expect(submitButton().disabled).toBe(false);
    expect(submitButton().textContent).toContain('Pull leads');
  });

  it('clamps count to 1..50', () => {
    type(input('Count'), '99');
    expect(input('Count').value).toBe('50');
    type(input('Count'), '0');
    expect(input('Count').value).toBe('1');
  });

  it('posts trimmed values and shows the upserted count on success', async () => {
    post.mockResolvedValue(new Response(JSON.stringify({ inserted: 7 }), { status: 200 }));
    type(input('Niche'), '  roofers ');
    type(input('Metro'), 'Austin, TX ');
    await submit();
    expect(post).toHaveBeenCalledWith('/api/pull-leads', {
      niche: 'roofers',
      metro: 'Austin, TX',
      count: 20,
    });
    expect(container.textContent).toContain('Sourced');
    expect(container.textContent).toContain('7 leads upserted.');
    expect(onInserted).toHaveBeenCalledWith(7);
  });

  it('disables the fields and relabels the button while sending', async () => {
    let resolve!: (r: Response) => void;
    post.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    type(input('Niche'), 'roofers');
    type(input('Metro'), 'Austin, TX');
    await submit();
    expect(submitButton().disabled).toBe(true);
    expect(submitButton().textContent).toContain('Pulling…');
    expect(input('Niche').disabled).toBe(true);
    await act(async () => resolve(new Response(JSON.stringify({ inserted: 1 }))));
    expect(container.textContent).toContain('1 lead upserted.');
  });

  it('shows the API error message on failure', async () => {
    post.mockResolvedValue(
      new Response(JSON.stringify({ error: 'OUTSCRAPER_API_KEY missing' }), { status: 502 }),
    );
    type(input('Niche'), 'roofers');
    type(input('Metro'), 'Austin, TX');
    await submit();
    expect(container.textContent).toContain('Error');
    expect(container.textContent).toContain('OUTSCRAPER_API_KEY missing');
    expect(onInserted).not.toHaveBeenCalled();
  });
});
