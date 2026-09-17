/**
 * ClientsIndexPage — /ops/clients must fail loud, never look empty. Until the
 * client store has answered (loading) or when it can't be reached (missing env,
 * migration not applied, expired session) the page must not render pipeline
 * figures or client sections: "Active Clients 0 / Retainer Value $0" under an
 * error reads as real numbers. A reachable-but-empty store is a real zero.
 *
 * The store hook and the fleet poll are stubbed. Synthetic data only.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { SYNTHETIC_CLIENTS } from '../../../../tests/helpers/synthetic-clients';
import ClientsIndexPage from './ClientsIndexPage';
import {
  buildClientRegistry,
  type ClientRecord,
  type UseClientRegistryResult,
} from './clientRegistry';

// vi.hoisted / vi.mock are hoisted above the imports by Vitest.
const store = vi.hoisted(() => ({
  current: null as unknown as UseClientRegistryResult,
}));

vi.mock('./clientRegistry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./clientRegistry')>()),
  useClientRegistry: () => store.current,
}));

vi.mock('../../lib/usePoll', () => ({
  usePoll: () => ({
    data: null,
    error: null,
    isOffline: false,
    isInitialLoading: true,
    lastUpdatedAt: null,
    refetch: () => {},
  }),
}));

const loaded = (records: ClientRecord[]): UseClientRegistryResult => ({
  registry: buildClientRegistry(records),
  error: null,
  isInitialLoading: false,
  localDrift: null,
});

describe('ClientsIndexPage', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render() {
    act(() => {
      root.render(
        <MemoryRouter>
          <ClientsIndexPage />
        </MemoryRouter>,
      );
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

  it('when the store is unreachable, shows the error and no pipeline figures or client sections', () => {
    store.current = {
      registry: null,
      error: 'CLIENT_RECORDS_TABLE_MISSING: apply the migration',
      isInitialLoading: false,
      localDrift: null,
    };
    const text = render();

    expect(text).toContain('Client records unavailable');
    expect(text).toContain('apply the migration');
    for (const figure of ['Pipeline', 'Active Clients', 'Retainer Value', '$0', 'Add client']) {
      expect(text).not.toContain(figure);
    }
    // Not client-store data — still shown.
    expect(text).toContain('Lead funnel');
  });

  it('while the first response is pending, shows loading and no pipeline figures', () => {
    store.current = { registry: null, error: null, isInitialLoading: true, localDrift: null };
    const text = render();

    expect(text).toContain('Loading client records');
    for (const figure of ['Active Clients', 'Retainer Value', '$0', 'Add client']) {
      expect(text).not.toContain(figure);
    }
  });

  it('once loaded, derives the pipeline from the records', () => {
    store.current = loaded(SYNTHETIC_CLIENTS as ClientRecord[]);
    const text = render();

    expect(text).toContain('Active Clients');
    expect(text).toContain('Retainer Value');
    expect(text).toContain('Example Agency Co');
    expect(text).not.toContain('Client records unavailable');
  });

  it('a reachable but empty store shows the import step and real zero figures', () => {
    store.current = loaded([]);
    const text = render();

    expect(text).toContain('No client records in the store yet');
    expect(text).toContain('Active Clients');
  });

  it("warns when this machine's clients/ folders differ from the store", () => {
    store.current = {
      ...loaded(SYNTHETIC_CLIENTS as ClientRecord[]),
      localDrift: { create: ['client-gamma'], update: ['client-alpha'], problems: [] },
    };
    const text = render();

    expect(text).toContain('client-gamma');
    expect(text).toContain('import-client-records.mjs --apply');
  });
});
