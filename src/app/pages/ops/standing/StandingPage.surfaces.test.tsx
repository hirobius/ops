/**
 * StandingPage × Surfaces (ops#416).
 *
 * Locks down the DoD: a declared-but-undeployed surface renders as "not
 * deployed" rather than being absent, a non-Vercel surface appears alongside
 * Vercel ones, the state word is one of the derived vocabulary (never
 * hand-typed prose), and the read is manual-refresh only — no polling, which
 * is the whole reason Standing stopped auto-refreshing in the first place
 * (ops#411, Vercel spend).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { FleetStatus, Surface } from '../ralphStatus';
import StandingPage from './StandingPage';

const EMPTY_FLEET: FleetStatus = {
  funnel: {},
  liveness: null,
  env: {},
  owners: [],
  repos: [],
  blocked: [],
  queue: [],
  backlog: [],
  sev1: [],
  decisions: [],
  total: 0,
  prs: [],
  loop: [],
  truncated: false,
  errors: [],
  counts: { openIssues: 0, repos: 0 },
};

const SURFACES: Surface[] = [
  {
    id: 'ops-dashboard',
    kind: 'vercel',
    name: 'Ops dashboard',
    repo: 'hirobius/ops',
    role: 'internal ops tool',
    url: 'https://hirobius-ops.vercel.app',
    state: 'gated',
  },
  {
    id: 'hds-npm',
    kind: 'npm',
    name: '@hirobius/design-system',
    repo: 'hirobius/hds',
    role: 'published package',
    url: 'https://www.npmjs.com/package/@hirobius/design-system',
    state: 'external',
  },
  {
    id: 'concrete-storefront',
    kind: 'vercel',
    name: 'concrete storefront',
    repo: 'hirobius/concrete',
    role: 'client site',
    url: null,
    state: 'not-deployed',
  },
];

const fetchMock = vi.fn(async (url: string) => {
  const body = url.startsWith('/api/tasks?fleet=1')
    ? EMPTY_FLEET
    : url.startsWith('/api/projects')
      ? { projects: [], surfaces: SURFACES }
      : { ok: true };
  return { ok: true, status: 200, json: async () => body };
});

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderStanding() {
  const router = createMemoryRouter([{ path: '/ops/standing', element: <StandingPage /> }], {
    initialEntries: ['/ops/standing'],
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe('StandingPage — Surfaces', () => {
  it('shows every registry surface, not only the ones Vercel discovered', async () => {
    await renderStanding();
    expect(await screen.findByText('Ops dashboard')).toBeTruthy();
    expect(screen.getByText('@hirobius/design-system')).toBeTruthy();
    expect(screen.getByText('concrete storefront')).toBeTruthy();
  });

  it('renders an undeployed surface as "not deployed" rather than omitting it', async () => {
    await renderStanding();
    const row = await screen.findByText('concrete storefront');
    const li = row.closest('li') as HTMLElement;
    expect(within(li).getByText('not deployed')).toBeTruthy();
  });

  it('renders a non-Vercel surface alongside Vercel ones, as an external link', async () => {
    await renderStanding();
    await screen.findByText('@hirobius/design-system');
    expect(screen.getByText('external link')).toBeTruthy();
  });

  it('renders the derived state word for a live-but-gated surface', async () => {
    await renderStanding();
    await screen.findByText('Ops dashboard');
    expect(screen.getByText('gated')).toBeTruthy();
  });

  // ops#416 DoD: "Manual refresh only — no polling. Assert it in a test."
  it('reads /api/projects exactly once on mount and never again without a tap', async () => {
    vi.useFakeTimers();
    try {
      await renderStanding();
      const callsAtMount = fetchMock.mock.calls.filter(([url]) =>
        String(url).startsWith('/api/projects'),
      ).length;
      expect(callsAtMount).toBe(1);

      // Ten minutes of wall-clock time — long past any of Standing's old
      // 60s/120s poll intervals — with no user action.
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

      const callsAfterTenMinutes = fetchMock.mock.calls.filter(([url]) =>
        String(url).startsWith('/api/projects'),
      ).length;
      expect(callsAfterTenMinutes).toBe(callsAtMount);
    } finally {
      vi.useRealTimers();
    }
  });
});
