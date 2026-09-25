/**
 * StandingPage × status.json freshness (ops#419).
 *
 * ops#417 shipped `statusFreshness` on `/api/projects`; nothing rendered it.
 * This locks down the render contract from the issue's own DoD: `current` is
 * silent, `unknown` is distinguishable from `current`, and the wording comes
 * from `freshnessLabel()` — never re-typed in the component.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { DeployProject, FleetStatus } from '../ralphStatus';
import { freshnessLabel } from '../../../../../lib/projects/freshness.mjs';
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

function project(name: string, statusFreshness: DeployProject['statusFreshness']): DeployProject {
  return {
    id: name,
    name,
    latestDeployment: {
      state: 'READY',
      url: `${name}.vercel.app`,
      createdAt: 1,
      target: 'production',
    },
    statusFreshness,
  };
}

let projects: DeployProject[] = [];

const fetchMock = vi.fn(async (url: string) => {
  const body = url.startsWith('/api/tasks?fleet=1')
    ? EMPTY_FLEET
    : url.startsWith('/api/projects')
      ? { projects, surfaces: [] }
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

describe('StandingPage — status.json freshness on Deploys', () => {
  it('renders no badge for a current project — the default case is silent', async () => {
    projects = [project('hds', { state: 'current', behindHours: 0 })];
    await renderStanding();
    const row = await screen.findByText('hds');
    const li = row.closest('li') as HTMLElement;
    expect(within(li).queryByText(/behind|unknown/)).toBeNull();
  });

  it('renders a quiet "Nh behind" badge for recent, using freshnessLabel verbatim', async () => {
    projects = [project('hds', { state: 'recent', behindHours: 3 })];
    await renderStanding();
    const row = await screen.findByText('hds');
    const li = row.closest('li') as HTMLElement;
    expect(
      within(li).getByText(freshnessLabel({ state: 'recent', behindHours: 3, behindMs: 0 })),
    ).toBeTruthy();
  });

  it('renders a loud stale badge that says not to trust the narrative', async () => {
    projects = [project('hds', { state: 'stale', behindHours: 30 })];
    await renderStanding();
    const row = await screen.findByText('hds');
    const li = row.closest('li') as HTMLElement;
    expect(within(li).getByText(/do not trust the narrative/)).toBeTruthy();
  });

  it('renders unknown as its own distinct word, never as silent/current', async () => {
    projects = [project('concrete', { state: 'unknown', behindHours: null })];
    await renderStanding();
    const row = await screen.findByText('concrete');
    const li = row.closest('li') as HTMLElement;
    expect(within(li).getByText('unknown')).toBeTruthy();
  });

  it('renders nothing when statusFreshness has not been attached (no GITHUB_TOKEN)', async () => {
    projects = [project('hds', null)];
    await renderStanding();
    const row = await screen.findByText('hds');
    const li = row.closest('li') as HTMLElement;
    expect(within(li).queryByText(/behind|unknown/)).toBeNull();
  });
});
