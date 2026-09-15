/**
 * lib/tasks/fleet.mjs — the lane rules behind /ops/standing's fleet-wide read.
 *
 * The contract these lock down: a repo joins the fleet by EXISTING in the
 * token's issue feed, never by appearing in a hardcoded list; parked outranks
 * blocked; and one PR search covers every owner rather than one call per repo.
 */
import { describe, it, expect } from 'vitest';
import {
  blockingLabelOf,
  laneOf,
  openPrSearchQuery,
  ownersOf,
  priorityOf,
  sortFleetLanes,
} from '../../lib/tasks/fleet.mjs';

function issue(over: Record<string, unknown>) {
  return {
    repo: 'hirobius/ops',
    number: 1,
    title: 'an issue',
    url: 'https://github.com/hirobius/ops/issues/1',
    labels: [] as string[],
    ...over,
  };
}

describe('laneOf', () => {
  it('returns null for ordinary backlog', () => {
    expect(laneOf(issue({ labels: ['backlog', 'p2'] }))).toBeNull();
  });

  it('routes each blocking label to the blocked lane', () => {
    for (const l of ['needs-adrian', 'needs-human', 'blocked']) {
      expect(laneOf(issue({ labels: [l] }))).toBe('blocked');
    }
  });

  it('routes ralph-ready to the queue', () => {
    expect(laneOf(issue({ labels: ['ralph-ready'] }))).toBe('queue');
  });

  it('prefers parked over blocked when an issue carries both', () => {
    expect(laneOf(issue({ labels: ['needs-adrian', 'ralph-parked'] }))).toBe('parked');
  });

  it('prefers blocked over queue, matching the selector exclusion', () => {
    expect(laneOf(issue({ labels: ['ralph-ready', 'blocked'] }))).toBe('blocked');
  });

  it('survives a missing labels array rather than throwing', () => {
    expect(laneOf({})).toBeNull();
  });
});

describe('blockingLabelOf', () => {
  it('picks the most specific label when several apply', () => {
    expect(blockingLabelOf(issue({ labels: ['blocked', 'needs-adrian'] }))).toBe('needs-adrian');
    expect(blockingLabelOf(issue({ labels: ['blocked', 'needs-human'] }))).toBe('needs-human');
  });

  it('returns null when nothing blocks', () => {
    expect(blockingLabelOf(issue({ labels: ['p1'] }))).toBeNull();
  });
});

describe('priorityOf', () => {
  it('reads p0..p3', () => {
    expect(priorityOf(issue({ labels: ['backlog', 'p0'] }))).toBe('p0');
    expect(priorityOf(issue({ labels: ['p3'] }))).toBe('p3');
  });

  it('ignores a look-alike label', () => {
    expect(priorityOf(issue({ labels: ['p4', 'pipeline'] }))).toBeNull();
  });
});

describe('ownersOf', () => {
  it('dedupes and preserves first-seen order', () => {
    expect(ownersOf(['hirobius/ops', 'adr-eng/access', 'hirobius/lilac'])).toEqual([
      'hirobius',
      'adr-eng',
    ]);
  });

  it('returns nothing for an empty fleet', () => {
    expect(ownersOf([])).toEqual([]);
  });
});

describe('openPrSearchQuery', () => {
  it('ORs one qualifier per owner so a single call covers the fleet', () => {
    expect(openPrSearchQuery(['hirobius', 'adr-eng'])).toBe(
      'is:pr is:open archived:false user:hirobius user:adr-eng',
    );
  });

  it('returns null rather than an unbounded query when there are no owners', () => {
    expect(openPrSearchQuery([])).toBeNull();
  });
});

describe('sortFleetLanes', () => {
  const fleet = [
    issue({ repo: 'hirobius/ops', number: 200, labels: ['needs-adrian', 'p1'] }),
    issue({ repo: 'hirobius/ops', number: 306, labels: ['needs-adrian', 'p2'] }),
    issue({ repo: 'adr-eng/access', number: 7, labels: ['ralph-parked'] }),
    issue({ repo: 'hirobius/lilac', number: 12, labels: ['ralph-ready', 'p0'] }),
    issue({ repo: 'hirobius/ops', number: 309, labels: ['ralph-ready', 'p2'] }),
    issue({ repo: 'hirobius/ops', number: 99, labels: ['backlog'] }),
  ];

  it('puts parked ahead of blocked, then orders blocked by priority', () => {
    expect(sortFleetLanes(fleet).blocked.map((b: { number: number }) => b.number)).toEqual([
      7, 200, 306,
    ]);
  });

  it('orders the queue by priority then number, selector-style', () => {
    expect(sortFleetLanes(fleet).queue.map((q: { number: number }) => q.number)).toEqual([12, 309]);
  });

  it('leaves ordinary backlog out of every lane', () => {
    const { blocked, queue } = sortFleetLanes(fleet);
    expect([...blocked, ...queue].map((i: { number: number }) => i.number)).not.toContain(99);
  });

  it('discovers every repo that appeared, across owners, sorted', () => {
    expect(sortFleetLanes(fleet).repos).toEqual([
      'adr-eng/access',
      'hirobius/lilac',
      'hirobius/ops',
    ]);
  });

  it('returns empty lanes for an empty sweep rather than throwing', () => {
    expect(sortFleetLanes([])).toEqual({ blocked: [], queue: [], repos: [] });
  });

  it('tolerates a non-array input', () => {
    expect(sortFleetLanes(null).repos).toEqual([]);
  });
});
