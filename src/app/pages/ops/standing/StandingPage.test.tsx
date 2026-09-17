/**
 * StandingPage × repo filter — every issue and PR lane honours `?repo=`.
 *
 * Rendered under a real memory router with only the network stubbed, so the
 * URL is the source of truth exactly as it is in the browser: a deep link
 * scopes the page, a chip tap pushes history, and Back undoes it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { FleetIssue, FleetPr, FleetStatus, LoopState } from '../ralphStatus';
import StandingPage from './StandingPage';

/** `repo` is a short name under hirobius, or a full `owner/repo`. */
function issue(repo: string, number: number, title: string, extra: Partial<FleetIssue> = {}) {
  const full = repo.includes('/') ? repo : `hirobius/${repo}`;
  return {
    repo: full,
    number,
    title,
    url: `https://github.com/${full}/issues/${number}`,
    label: null,
    prio: null,
    ageDays: 3,
    quietDays: 1,
    labels: [],
    comments: 0,
    assignee: null,
    hasDod: true,
    excerpt: '',
    queued: false,
    auto: false,
    wip: false,
    ...extra,
  } satisfies FleetIssue;
}

const pr = (repo: string, number: number, title: string): FleetPr => ({
  repo: `hirobius/${repo}`,
  number,
  title,
  url: `https://github.com/hirobius/${repo}/pull/${number}`,
  draft: false,
  updatedAt: '2026-09-16T00:00:00Z',
  labels: [],
});

const FLEET: FleetStatus = {
  funnel: {},
  liveness: null,
  env: {},
  owners: ['hirobius'],
  repos: ['hirobius/client-alpha', 'hirobius/job-hunt', 'hirobius/ops'],
  blocked: [
    issue('ops', 1, 'Decide the ops thing', { label: 'needs-adrian' }),
    issue('client-alpha', 2, 'Decide the client-alpha thing', { label: 'needs-adrian' }),
  ],
  queue: [issue('ops', 3, 'Queued ops work', { queued: true })],
  backlog: [
    issue('job-hunt', 4, 'Job hunt backlog A'),
    issue('job-hunt', 5, 'Job hunt backlog B'),
    issue('client-alpha', 6, 'Client-alpha backlog'),
  ],
  total: 6,
  prs: [pr('client-alpha', 7, 'Client-alpha PR')],
  // Required since ops#317: isFleetStatus rejects a payload with no sev1 array.
  sev1: [],
  loop: [],
  truncated: false,
  errors: [],
  counts: { openIssues: 6, repos: 3 },
};

const loop = (repo: string, extra: Partial<LoopState>): LoopState => ({
  repo: `hirobius/${repo}`,
  state: 'idle',
  run: null,
  quietHours: 5,
  conclusion: 'success',
  error: null,
  ...extra,
});

/** What the fleet read returns — FLEET unless a test swaps it. */
let fleet: FleetStatus = FLEET;

const fetchMock = vi.fn(async (url: string) => {
  const body = url.startsWith('/api/tasks?fleet=1')
    ? fleet
    : url.startsWith('/api/projects')
      ? { projects: [] }
      : { ok: true };
  return { ok: true, status: 200, json: async () => body };
});

beforeEach(() => {
  fleet = FLEET;
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderAt(url: string) {
  const router = createMemoryRouter([{ path: '/ops/standing', element: <StandingPage /> }], {
    initialEntries: [url],
  });
  render(<RouterProvider router={router} />);
  // The chip row only renders once the fleet payload has landed.
  await screen.findByRole('group', { name: 'Filter lanes by repo' });
  return router;
}

const lane = (name: string) => screen.getByRole('region', { name });
const chip = (name: RegExp) =>
  within(screen.getByRole('group', { name: 'Filter lanes by repo' })).getByRole('button', { name });

describe('StandingPage — repo filter', () => {
  it('scopes every issue and PR lane to the repo a deep link names, with filtered counts', async () => {
    await renderAt('/ops/standing?repo=ops');

    const waiting = lane('Waiting on you');
    expect(within(waiting).getByText('1 blocked on you')).toBeTruthy();
    expect(within(waiting).getByText('Decide the ops thing')).toBeTruthy();
    expect(within(waiting).queryByText('Decide the client-alpha thing')).toBeNull();

    expect(within(lane('Queued for the loop')).getByText('1 ralph-ready issue')).toBeTruthy();
    expect(chip(/^ops/).getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps an emptied lane on the page with a short empty state naming the repo', async () => {
    await renderAt('/ops/standing?repo=ops');

    const inFlight = lane('In flight');
    expect(within(inFlight).getByText('0 open PRs')).toBeTruthy();
    expect(within(inFlight).getByText('No open PRs in ops.')).toBeTruthy();

    const backlog = lane('Backlog');
    expect(within(backlog).getByText('0 issues')).toBeTruthy();
    expect(within(backlog).getByText('Nothing else open in ops.')).toBeTruthy();
  });

  it('writes the choice to the URL and gives it back on Back', async () => {
    const router = await renderAt('/ops/standing');
    expect(within(lane('Waiting on you')).getByText('2 blocked on you')).toBeTruthy();

    fireEvent.click(chip(/^client-alpha/));

    expect(router.state.location.search).toBe('?repo=client-alpha');
    expect(within(lane('Waiting on you')).getByText('1 blocked on you')).toBeTruthy();
    expect(within(lane('Waiting on you')).queryByText('Decide the ops thing')).toBeNull();

    await act(() => router.navigate(-1));

    expect(router.state.location.search).toBe('');
    expect(within(lane('Waiting on you')).getByText('2 blocked on you')).toBeTruthy();
  });

  it('clears the param when All repos is chosen', async () => {
    const router = await renderAt('/ops/standing?repo=client-alpha');

    fireEvent.click(chip(/^All repos/));

    expect(router.state.location.search).toBe('');
    expect(within(lane('Backlog')).getByText('3 issues')).toBeTruthy();
  });

  it('falls back to every repo, visibly, when the link names a repo with nothing open', async () => {
    await renderAt('/ops/standing?repo=portal-kit');

    expect(screen.getByText('Nothing open in “portal-kit” — showing all repos.')).toBeTruthy();
    expect(within(lane('Waiting on you')).getByText('2 blocked on you')).toBeTruthy();
    expect(chip(/^All repos/).getAttribute('aria-pressed')).toBe('true');
  });

  it('lets All repos clear a dead link, taking the note with it', async () => {
    const router = await renderAt('/ops/standing?repo=portal-kit');

    fireEvent.click(chip(/^All repos/));

    expect(router.state.location.search).toBe('');
    expect(screen.queryByText('Nothing open in “portal-kit” — showing all repos.')).toBeNull();
  });

  it('says a short name is ambiguous — not that nothing is open — when two owners share it', async () => {
    fleet = {
      ...FLEET,
      blocked: [],
      queue: [],
      backlog: [
        issue('hirobius/site', 1, 'Hirobius site'),
        issue('adr-eng/site', 2, 'Adr-eng site'),
      ],
      prs: [],
    };
    await renderAt('/ops/standing?repo=site');

    expect(
      screen.getByText(
        '“site” matches adr-eng/site and hirobius/site — pick one. Showing all repos.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Nothing open in/)).toBeNull();
    expect(within(lane('Backlog')).getByText('2 issues')).toBeTruthy();
  });

  it('selects the repo whose chip was tapped when two names differ only in case', async () => {
    fleet = {
      ...FLEET,
      blocked: [],
      queue: [],
      backlog: [
        issue('adr-eng/site', 1, 'Adr-eng site A'),
        issue('adr-eng/site', 2, 'Adr-eng site B'),
        issue('hirobius/Site', 3, 'Hirobius Site'),
      ],
      prs: [],
    };
    const router = await renderAt('/ops/standing');

    fireEvent.click(chip(/^hirobius\/Site 1 open/));

    expect(router.state.location.search).toBe('?repo=hirobius%2FSite');
    expect(chip(/^hirobius\/Site/).getAttribute('aria-pressed')).toBe('true');
    const backlog = lane('Backlog');
    expect(within(backlog).getByText('1 issue')).toBeTruthy();
    expect(within(backlog).getByText('Hirobius Site')).toBeTruthy();
    expect(within(backlog).queryByText('Adr-eng site A')).toBeNull();
  });

  it('scopes the loop to the selected repo, so another repo’s failure does not read as this one’s', async () => {
    fleet = {
      ...FLEET,
      loop: [
        loop('client-alpha', {
          state: 'failed',
          conclusion: 'failure',
          run: {
            number: 99,
            title: 'Ralph client-alpha#2',
            url: 'https://github.com/hirobius/client-alpha/actions/runs/99',
          },
        }),
        loop('ops', {}),
      ],
    };
    await renderAt('/ops/standing?repo=ops');

    const theLoop = lane('The loop');
    // The header count and ops's own badge — and nothing failing.
    expect(within(theLoop).getAllByText('idle')).toHaveLength(2);
    expect(within(theLoop).queryByText('1 failing')).toBeNull();
    expect(within(theLoop).queryByText('failed')).toBeNull();
    expect(within(theLoop).queryByText('Ralph client-alpha#2')).toBeNull();
    expect(within(theLoop).getByText('ops')).toBeTruthy();
  });

  it('shows the whole loop unfiltered, and a scoped empty state for a repo it does not watch', async () => {
    fleet = {
      ...FLEET,
      loop: [
        loop('client-alpha', {
          state: 'failed',
          conclusion: 'failure',
          run: {
            number: 99,
            title: 'Ralph client-alpha#2',
            url: 'https://github.com/hirobius/client-alpha/actions/runs/99',
          },
        }),
        loop('ops', {}),
      ],
    };
    const router = await renderAt('/ops/standing');

    expect(within(lane('The loop')).getByText('1 failing')).toBeTruthy();
    expect(within(lane('The loop')).getByText('Ralph client-alpha#2')).toBeTruthy();

    fireEvent.click(chip(/^job-hunt/));

    expect(router.state.location.search).toBe('?repo=job-hunt');
    expect(
      within(lane('The loop')).getByText(
        'No loop is watched in job-hunt — runs are read only for repos with a ralph-* labelled issue.',
      ),
    ).toBeTruthy();
  });

  it('leaves the per-row actions working on a filtered lane', async () => {
    await renderAt('/ops/standing?repo=job-hunt');

    fireEvent.click(screen.getByRole('button', { name: 'Queue job-hunt#4' }));

    await screen.findByText('Queued — GitHub updated.');
    const post = fetchMock.mock.calls.find(([url]) => url === '/api/task-action');
    expect(JSON.parse((post?.[1] as { body: string }).body)).toMatchObject({
      key: 'github:hirobius/job-hunt#4',
      action: 'queue_on',
    });
  });
});
