/**
 * Unit tests for scripts/metric-human-gate-latency.mjs (ops#297).
 *
 * Interval-reconstruction and stats/violation logic are pure — tested with
 * plain fixtures. `fetchGateLabelEvents` takes an injectable `fetchImpl`, so
 * its pagination + filtering is exercised with a stubbed API client — no
 * network, per the ops#297 DoD.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  GATE_LABELS,
  DEFAULT_TARGET_DAYS,
  buildGateIntervals,
  median,
  computeStats,
  buildViolations,
  formatHuman,
  fetchGateLabelEvents,
} from '../metric-human-gate-latency.mjs';

const NOW = Date.parse('2026-09-16T00:00:00.000Z');

function ev(event, label, issueNumber, createdAt, issueTitle = `issue ${issueNumber}`) {
  return { event, label, issueNumber, issueTitle, issueUrl: `https://x/${issueNumber}`, createdAt };
}

describe('median', () => {
  it('returns null for an empty list', () => {
    expect(median([])).toBeNull();
  });

  it('returns the middle value for an odd-length list', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('averages the two middle values for an even-length list', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('buildGateIntervals', () => {
  it('pairs a labeled/unlabeled event into a closed interval', () => {
    const events = [
      ev('labeled', 'needs-decision', 1, '2026-09-01T00:00:00.000Z'),
      ev('unlabeled', 'needs-decision', 1, '2026-09-05T00:00:00.000Z'),
    ];
    const intervals = buildGateIntervals(events, { now: NOW });
    expect(intervals).toHaveLength(1);
    expect(intervals[0]).toMatchObject({
      issueNumber: 1,
      label: 'needs-decision',
      startedAt: '2026-09-01T00:00:00.000Z',
      endedAt: '2026-09-05T00:00:00.000Z',
      days: 4,
    });
  });

  it('leaves an interval open (endedAt: null) when never unlabeled, using `now`', () => {
    const events = [ev('labeled', 'needs-adrian', 2, '2026-09-10T00:00:00.000Z')];
    const intervals = buildGateIntervals(events, { now: NOW });
    expect(intervals).toHaveLength(1);
    expect(intervals[0].endedAt).toBeNull();
    expect(intervals[0].days).toBe(6);
  });

  it('ignores a stray unlabeled with no matching open interval', () => {
    const events = [ev('unlabeled', 'needs-credential', 3, '2026-09-05T00:00:00.000Z')];
    expect(buildGateIntervals(events, { now: NOW })).toEqual([]);
  });

  it('handles the same issue+label gated twice as two independent episodes', () => {
    const events = [
      ev('labeled', 'needs-adrian', 4, '2026-09-01T00:00:00.000Z'),
      ev('unlabeled', 'needs-adrian', 4, '2026-09-02T00:00:00.000Z'),
      ev('labeled', 'needs-adrian', 4, '2026-09-10T00:00:00.000Z'),
      ev('unlabeled', 'needs-adrian', 4, '2026-09-12T00:00:00.000Z'),
    ];
    const intervals = buildGateIntervals(events, { now: NOW });
    expect(intervals).toHaveLength(2);
    expect(intervals[0].days).toBe(1);
    expect(intervals[1].days).toBe(2);
  });

  it('ignores events for labels outside GATE_LABELS', () => {
    const events = [ev('labeled', 'bug', 5, '2026-09-01T00:00:00.000Z')];
    expect(buildGateIntervals(events, { now: NOW })).toEqual([]);
  });

  it('ships the documented gate labels', () => {
    expect(GATE_LABELS).toEqual(['needs-adrian', 'needs-decision', 'needs-credential']);
  });
});

describe('computeStats', () => {
  it('returns nulls and no oldest-open for an empty interval list', () => {
    const stats = computeStats([]);
    expect(stats.overallMedianDays).toBeNull();
    expect(stats.oldestOpen).toBeNull();
    for (const label of GATE_LABELS) {
      expect(stats.byLabel[label]).toEqual({ count: 0, medianDays: null });
    }
  });

  it('computes overall median and a per-label breakdown', () => {
    const events = [
      ev('labeled', 'needs-adrian', 1, '2026-09-01T00:00:00.000Z'),
      ev('unlabeled', 'needs-adrian', 1, '2026-09-03T00:00:00.000Z'), // 2d
      ev('labeled', 'needs-credential', 2, '2026-09-01T00:00:00.000Z'),
      ev('unlabeled', 'needs-credential', 2, '2026-09-11T00:00:00.000Z'), // 10d
    ];
    const intervals = buildGateIntervals(events, { now: NOW });
    const stats = computeStats(intervals);
    expect(stats.overallMedianDays).toBe(6);
    expect(stats.byLabel['needs-adrian']).toEqual({ count: 1, medianDays: 2 });
    expect(stats.byLabel['needs-credential']).toEqual({ count: 1, medianDays: 10 });
    expect(stats.byLabel['needs-decision']).toEqual({ count: 0, medianDays: null });
  });

  it('picks the still-open episode with the longest current duration as oldest', () => {
    const events = [
      ev('labeled', 'needs-decision', 10, '2026-09-10T00:00:00.000Z', 'newer gate'), // 6d open
      ev('labeled', 'needs-adrian', 11, '2026-08-01T00:00:00.000Z', 'ancient gate'), // 46d open
      ev('labeled', 'needs-credential', 12, '2026-09-01T00:00:00.000Z'),
      ev('unlabeled', 'needs-credential', 12, '2026-09-05T00:00:00.000Z'), // closed, excluded
    ];
    const intervals = buildGateIntervals(events, { now: NOW });
    const stats = computeStats(intervals);
    expect(stats.oldestOpen.issueNumber).toBe(11);
    expect(stats.oldestOpen.issueTitle).toBe('ancient gate');
    expect(stats.oldestOpen.days).toBe(46);
  });
});

describe('buildViolations', () => {
  it('emits nothing when there is no data', () => {
    expect(buildViolations({ overallMedianDays: null })).toEqual([]);
  });

  it('emits nothing when median is at or below target', () => {
    expect(buildViolations({ overallMedianDays: 7, targetDays: 7 })).toEqual([]);
    expect(buildViolations({ overallMedianDays: 3, targetDays: 7 })).toEqual([]);
  });

  it('emits exactly one warn-severity violation when median is above target', () => {
    const violations = buildViolations({ overallMedianDays: 12, targetDays: DEFAULT_TARGET_DAYS });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      file: '*',
      line: null,
      rule: 'HUMAN_GATE_LATENCY_ABOVE_TARGET',
      severity: 'warn',
    });
    expect(violations[0].message).toMatch(/12\.0d.*above target.*7d/);
  });
});

describe('formatHuman', () => {
  it('renders median, per-label breakdown, and oldest-open line', () => {
    const byLabel = {
      'needs-adrian': { count: 1, medianDays: 2 },
      'needs-decision': { count: 0, medianDays: null },
      'needs-credential': { count: 1, medianDays: 10 },
    };
    const output = formatHuman({
      overallMedianDays: 6,
      byLabel,
      oldestOpen: { issueNumber: 11, issueTitle: 'ancient gate', label: 'needs-adrian', days: 46 },
    });
    expect(output).toContain('median 6.0d');
    expect(output).toContain('needs-adrian: median 2.0d (1 episode)');
    expect(output).toContain('needs-decision: median n/a (0 episodes)');
    expect(output).toContain('#11 "ancient gate" — 46.0d on needs-adrian');
  });

  it('renders a no-data line when nothing is currently gated', () => {
    const byLabel = Object.fromEntries(GATE_LABELS.map((l) => [l, { count: 0, medianDays: null }]));
    const output = formatHuman({ overallMedianDays: null, byLabel, oldestOpen: null });
    expect(output).toContain('median n/a');
    expect(output).toContain('oldest open: none currently gated');
  });
});

describe('fetchGateLabelEvents', () => {
  function jsonResponse(body, { status = 200, link = null } = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name) => (name.toLowerCase() === 'link' ? link : null) },
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  }

  it('fetches and filters labeled/unlabeled events to GATE_LABELS only', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([
        {
          event: 'labeled',
          label: { name: 'needs-adrian' },
          issue: { number: 1, title: 'a gated issue', html_url: 'https://x/1' },
          created_at: '2026-09-01T00:00:00.000Z',
        },
        {
          event: 'labeled',
          label: { name: 'bug' },
          issue: { number: 1, title: 'a gated issue', html_url: 'https://x/1' },
          created_at: '2026-09-01T00:00:00.000Z',
        },
        {
          event: 'commented',
          issue: { number: 1, title: 'a gated issue', html_url: 'https://x/1' },
          created_at: '2026-09-01T00:00:00.000Z',
        },
      ]),
    );

    const events = await fetchGateLabelEvents({ repo: 'hirobius/ops', token: 'tok', fetchImpl });
    expect(events).toEqual([
      {
        event: 'labeled',
        label: 'needs-adrian',
        issueNumber: 1,
        issueTitle: 'a gated issue',
        issueUrl: 'https://x/1',
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ]);
  });

  it('follows Link pagination across pages', async () => {
    const nextUrl = 'https://api.github.com/repos/hirobius/ops/issues/events?page=2';
    const fetchImpl = vi.fn(async (url) => {
      if (!url.includes('page=2')) {
        return jsonResponse(
          [
            {
              event: 'labeled',
              label: { name: 'needs-decision' },
              issue: { number: 1, title: 'first', html_url: 'https://x/1' },
              created_at: '2026-09-01T00:00:00.000Z',
            },
          ],
          { link: `<${nextUrl}>; rel="next"` },
        );
      }
      return jsonResponse([
        {
          event: 'unlabeled',
          label: { name: 'needs-decision' },
          issue: { number: 1, title: 'first', html_url: 'https://x/1' },
          created_at: '2026-09-02T00:00:00.000Z',
        },
      ]);
    });

    const events = await fetchGateLabelEvents({ repo: 'hirobius/ops', token: 'tok', fetchImpl });
    expect(events).toHaveLength(2);
  });

  it('throws an actionable error on 401/403', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, { status: 403 }));
    await expect(
      fetchGateLabelEvents({ repo: 'hirobius/ops', token: 'bad', fetchImpl }),
    ).rejects.toThrow(/GITHUB_TOKEN is expired, revoked/);
  });
});
