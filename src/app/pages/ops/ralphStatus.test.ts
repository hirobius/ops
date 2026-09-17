import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchFleetStatus,
  fetchRalphStatus,
  shortRepo,
  type FleetStatus,
  type RalphStatus,
} from './ralphStatus';

const EMPTY_PAYLOAD: RalphStatus = { runs: [], queue: [], parked: [], prs: [], errors: [] };

function mockFetch(res: { ok: boolean; status: number; body: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: res.ok,
      status: res.status,
      json: async () => {
        if (res.body === undefined) throw new Error('not json');
        return res.body;
      },
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchRalphStatus', () => {
  const signal = new AbortController().signal;

  it('returns the payload when all four lanes are present', async () => {
    mockFetch({ ok: true, status: 200, body: EMPTY_PAYLOAD });
    await expect(fetchRalphStatus(signal)).resolves.toEqual(EMPTY_PAYLOAD);
  });

  it("surfaces the backend's own message verbatim on a non-2xx", async () => {
    mockFetch({
      ok: false,
      status: 503,
      body: { error: 'GITHUB_TOKEN not set — add it in Vercel → Settings', code: 'ENV_MISSING' },
    });
    await expect(fetchRalphStatus(signal)).rejects.toThrow(/GITHUB_TOKEN not set/);
  });

  it('falls back to the status code when the error body has no message', async () => {
    mockFetch({ ok: false, status: 502, body: null });
    await expect(fetchRalphStatus(signal)).rejects.toThrow('HTTP 502');
  });

  // The bug this guards: a dev server or rewrite answering 200 with index.html
  // used to parse as `null`, render as four empty lanes, and read as
  // "nothing is waiting on you" — the most dangerous wrong answer here.
  it('rejects a 200 whose body is not the fleet payload, instead of rendering empty lanes', async () => {
    mockFetch({ ok: true, status: 200, body: undefined });
    await expect(fetchRalphStatus(signal)).rejects.toThrow(/did not handle this request/);
  });

  it('rejects a 200 that is an object but is missing a lane', async () => {
    mockFetch({ ok: true, status: 200, body: { runs: [], queue: [], parked: [] } });
    await expect(fetchRalphStatus(signal)).rejects.toThrow(/not the fleet payload/);
  });
});

describe('fetchFleetStatus', () => {
  const signal = new AbortController().signal;
  const FLEET: FleetStatus = {
    funnel: {},
    liveness: null,
    env: {},
    owners: [],
    repos: [],
    blocked: [],
    queue: [],
    backlog: [],
    sev1: [],
    total: 0,
    prs: [],
    errors: [],
    counts: { openIssues: 0, repos: 0 },
  };

  it('returns the payload when every lane, including sev1, is present', async () => {
    mockFetch({ ok: true, status: 200, body: FLEET });
    await expect(fetchFleetStatus(signal)).resolves.toEqual(FLEET);
  });

  // ops#317: a payload with no sev1 list must not render as "no open sev1".
  // That is the all-clear reading, and it would be a lie.
  it('rejects a payload missing the sev1 list rather than reading it as all-clear', async () => {
    const { sev1: _omit, ...withoutSev1 } = FLEET;
    mockFetch({ ok: true, status: 200, body: withoutSev1 });
    await expect(fetchFleetStatus(signal)).rejects.toThrow(/not the fleet payload/);
  });
});

describe('shortRepo', () => {
  it('drops the owner', () => {
    expect(shortRepo('hirobius/ops')).toBe('ops');
  });

  it('leaves an already-short name alone', () => {
    expect(shortRepo('ops')).toBe('ops');
  });
});
