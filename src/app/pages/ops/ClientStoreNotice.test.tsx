/**
 * ClientStoreDrift — the dev-only warning that this machine's gitignored
 * clients/<slug>/ folders say something the private store doesn't (a hand edit
 * that was never imported, or a write whose sync failed). Without it the client
 * pages would silently render the store's older copy. Synthetic slugs only.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ClientStoreDrift } from './ClientStoreNotice';
import type { UseClientRegistryResult } from './clientRegistry';

const base: UseClientRegistryResult = {
  registry: {},
  error: null,
  isInitialLoading: false,
  localDrift: null,
};

describe('ClientStoreDrift', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(state: UseClientRegistryResult) {
    act(() => {
      root.render(<ClientStoreDrift state={state} />);
    });
    return container.textContent ?? '';
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders nothing when the store and local folders agree (or there are none)', () => {
    expect(render(base)).toBe('');
  });

  it('names the new and changed clients and gives the import command', () => {
    const text = render({
      ...base,
      localDrift: { create: ['client-gamma'], update: ['client-alpha'], problems: [] },
    });

    expect(text).toContain('client-gamma');
    expect(text).toContain('client-alpha');
    expect(text).toContain('node --env-file=.env.local scripts/import-client-records.mjs --apply');
  });

  it('lists local folders the import would reject', () => {
    const text = render({
      ...base,
      localDrift: {
        create: [],
        update: [],
        problems: ['client-delta: meta.json is not valid JSON (Unexpected token)'],
      },
    });

    expect(text).toContain('client-delta: meta.json is not valid JSON');
  });
});
