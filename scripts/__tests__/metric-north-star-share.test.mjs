/**
 * Unit tests for scripts/metric-north-star-share.mjs (ops#293).
 *
 * Path-matching and share/violation logic are pure — tested with plain
 * fixtures. `fetchMergedPRsWithFiles` takes an injectable `fetchImpl`, so its
 * pagination + aggregation is exercised with a stubbed API client — no
 * network, per the ops#293 DoD.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  REVENUE_PATH_PREFIXES,
  DEFAULT_TARGET_SHARE,
  isRevenuePathFile,
  computeShare,
  buildViolations,
  formatHuman,
  fetchMergedPRsWithFiles,
} from '../metric-north-star-share.mjs';

describe('isRevenuePathFile', () => {
  it('matches a file under a directory prefix', () => {
    expect(isRevenuePathFile('lib/leads/upsert.mjs')).toBe(true);
    expect(isRevenuePathFile('lib/outreach/send.mjs')).toBe(true);
    expect(isRevenuePathFile('src/app/pages/ops/leads/LeadsPage.tsx')).toBe(true);
  });

  it('matches an exact file entry', () => {
    expect(isRevenuePathFile('api/lead-action.ts')).toBe(true);
  });

  it('does not match a look-alike sibling path', () => {
    // 'lib/leads/' vs 'lib/lead-gen/' must not cross-match on a shared prefix
    expect(isRevenuePathFile('lib/lead-gen/score.mjs')).toBe(true); // its own prefix
    expect(isRevenuePathFile('lib/leadsboard/foo.mjs')).toBe(false); // not a real prefix match
  });

  it('counts the pitch call sheet — where a built site becomes a conversation', () => {
    expect(isRevenuePathFile('src/app/pages/ops/pitch/PitchPage.tsx')).toBe(true);
  });

  it('does not match unrelated paths', () => {
    expect(isRevenuePathFile('src/app/pages/ops/tasks/TasksPage.tsx')).toBe(false);
    expect(isRevenuePathFile('scripts/audit-deps.mjs')).toBe(false);
  });

  it('accepts a custom prefix list', () => {
    expect(isRevenuePathFile('foo/bar.ts', ['foo/'])).toBe(true);
    expect(isRevenuePathFile('foo/bar.ts', [])).toBe(false);
  });

  it('ships the documented revenue path prefixes', () => {
    expect(REVENUE_PATH_PREFIXES).toEqual(
      expect.arrayContaining([
        'lib/agent/',
        'lib/leads/',
        'lib/lead-gen/',
        'lib/render/',
        'lib/outreach/',
        'api/lead-action.ts',
        'src/app/pages/ops/leads/',
        'src/app/pages/ops/pitch/',
      ]),
    );
  });
});

describe('computeShare', () => {
  it('returns null share for an empty window (no data, not 0%)', () => {
    expect(computeShare([])).toEqual({ total: 0, touching: 0, share: null });
  });

  it('counts a PR as touching when any one changed file matches', () => {
    const result = computeShare([
      ['lib/leads/upsert.mjs', 'src/components/Foo.tsx'],
      ['src/components/Bar.tsx'],
      ['api/lead-action.ts'],
    ]);
    expect(result).toEqual({ total: 3, touching: 2, share: 2 / 3 });
  });

  it('matches the documented 0/15 baseline shape', () => {
    const prs = Array.from({ length: 15 }, () => ['src/components/Unrelated.tsx']);
    expect(computeShare(prs)).toEqual({ total: 15, touching: 0, share: 0 });
  });
});

describe('buildViolations', () => {
  it('emits nothing when share is null (empty window)', () => {
    expect(buildViolations({ share: null })).toEqual([]);
  });

  it('emits nothing when share is at or above target', () => {
    expect(buildViolations({ share: 0.2, targetShare: 0.2 })).toEqual([]);
    expect(buildViolations({ share: 0.5, targetShare: 0.2 })).toEqual([]);
  });

  it('emits exactly one warn-severity violation when share is below target', () => {
    const violations = buildViolations({ share: 0, targetShare: DEFAULT_TARGET_SHARE });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      file: '*',
      line: null,
      rule: 'NORTH_STAR_SHARE_BELOW_TARGET',
      severity: 'warn',
    });
    expect(violations[0].message).toMatch(/0\.0%.*below target.*20\.0%/);
  });
});

describe('formatHuman', () => {
  it('renders the documented "north-star share: N/M ..." line', () => {
    expect(formatHuman({ touching: 0, total: 15, share: 0, windowDays: 14 })).toBe(
      'north-star share: 0/15 merged PRs (0.0%) over 14d',
    );
  });

  it('renders n/a for an empty window', () => {
    expect(formatHuman({ touching: 0, total: 0, share: null, windowDays: 14 })).toBe(
      'north-star share: 0/0 merged PRs (n/a) over 14d',
    );
  });
});

describe('fetchMergedPRsWithFiles', () => {
  function jsonResponse(body, { status = 200, link = null } = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name) => (name.toLowerCase() === 'link' ? link : null) },
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  }

  it("fetches merged PR numbers then each PR's changed files", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('/search/issues')) {
        return jsonResponse({ items: [{ number: 10 }, { number: 11 }] });
      }
      if (url.includes('/pulls/10/files')) {
        return jsonResponse([{ filename: 'lib/leads/upsert.mjs' }, { filename: 'README.md' }]);
      }
      if (url.includes('/pulls/11/files')) {
        return jsonResponse([{ filename: 'src/components/Foo.tsx' }]);
      }
      throw new Error(`unexpected url: ${url}`);
    });

    const result = await fetchMergedPRsWithFiles({
      repo: 'hirobius/ops',
      token: 'tok',
      days: 14,
      now: Date.parse('2026-09-15T00:00:00.000Z'),
      fetchImpl,
    });

    expect(result).toEqual([['lib/leads/upsert.mjs', 'README.md'], ['src/components/Foo.tsx']]);
    const searchUrl = fetchImpl.mock.calls[0][0];
    expect(searchUrl).toContain('is%3Amerged');
    expect(searchUrl).toContain('merged%3A%3E%3D2026-09-01');
  });

  it('follows Link pagination for the search results', async () => {
    const nextUrl = 'https://api.github.com/search/issues?page=2';
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('/search/issues') && !url.includes('page=2')) {
        return jsonResponse({ items: [{ number: 1 }] }, { link: `<${nextUrl}>; rel="next"` });
      }
      if (url === nextUrl) {
        return jsonResponse({ items: [{ number: 2 }] });
      }
      if (url.includes('/pulls/')) {
        return jsonResponse([{ filename: 'lib/render/site.mjs' }]);
      }
      throw new Error(`unexpected url: ${url}`);
    });

    const result = await fetchMergedPRsWithFiles({
      repo: 'hirobius/ops',
      token: 'tok',
      fetchImpl,
    });

    expect(result).toHaveLength(2);
  });

  it('throws an actionable error on 401/403', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, { status: 401 }));
    await expect(
      fetchMergedPRsWithFiles({ repo: 'hirobius/ops', token: 'bad', fetchImpl }),
    ).rejects.toThrow(/GITHUB_TOKEN is expired, revoked/);
  });
});
