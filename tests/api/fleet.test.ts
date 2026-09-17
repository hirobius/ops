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

  // The page is the whole board. An issue with no lane label used to vanish
  // from Standing entirely and was only reachable via /ops/tasks, whose mirror
  // is as fresh as the last manual Import.
  it('puts unlabelled issues in backlog rather than dropping them', () => {
    const { blocked, queue, backlog, total } = sortFleetLanes(fleet);
    expect(backlog.map((i: { number: number }) => i.number)).toEqual([99]);
    expect(blocked.length + queue.length + backlog.length).toBe(total);
  });

  it('accounts for every issue exactly once across the lanes', () => {
    const { blocked, queue, backlog } = sortFleetLanes(fleet);
    const seen = [...blocked, ...queue, ...backlog].map((i: { number: number }) => i.number);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.sort((a: number, b: number) => a - b)).toEqual([7, 12, 99, 200, 306, 309]);
  });

  it('orders backlog by priority then number, like the other lanes', () => {
    const mixed = [
      issue({ number: 50, labels: ['backlog', 'p3'] }),
      issue({ number: 20, labels: ['backlog', 'p1'] }),
      issue({ number: 10, labels: ['backlog', 'p3'] }),
    ];
    expect(sortFleetLanes(mixed).backlog.map((i: { number: number }) => i.number)).toEqual([
      20, 10, 50,
    ]);
  });

  it('discovers every repo that appeared, across owners, sorted', () => {
    expect(sortFleetLanes(fleet).repos).toEqual([
      'adr-eng/access',
      'hirobius/lilac',
      'hirobius/ops',
    ]);
  });

  it('returns empty lanes for an empty sweep rather than throwing', () => {
    expect(sortFleetLanes([])).toEqual({
      blocked: [],
      queue: [],
      backlog: [],
      sev1: [],
      repos: [],
      total: 0,
    });
  });

  // ops#317: a sev1 must not be one line among fifty. `sev1` is a call-out
  // ACROSS the lanes, not a lane of its own — the issue still sits in whichever
  // lane its other labels put it in, so the every-issue-exactly-once invariant
  // above is untouched.
  describe('sev1 call-out', () => {
    const withSev = [
      issue({ repo: 'hirobius/ops', number: 27, title: 'PII', labels: ['sev1', 'needs-decision'] }),
      issue({ repo: 'hirobius/hds', number: 4, title: 'hds fire', labels: ['sev1', 'p0'] }),
      issue({ repo: 'hirobius/ops', number: 35, labels: ['sev2', 'needs-adrian'] }),
      issue({ repo: 'hirobius/ops', number: 99, labels: ['backlog'] }),
    ];

    it('lists every sev1, ordered by repo then number, whatever lane it sits in', () => {
      expect(sortFleetLanes(withSev).sev1).toEqual([
        {
          repo: 'hirobius/hds',
          number: 4,
          title: 'hds fire',
          url: 'https://github.com/hirobius/ops/issues/1',
          label: 'sev1',
          prio: 'p0',
        },
        {
          repo: 'hirobius/ops',
          number: 27,
          title: 'PII',
          url: 'https://github.com/hirobius/ops/issues/1',
          label: 'sev1',
          prio: null,
        },
      ]);
    });

    it('leaves a sev1 in its own lane as well', () => {
      const { backlog, total, blocked, queue } = sortFleetLanes(withSev);
      expect(backlog.map((i: { number: number }) => i.number)).toEqual([4, 27, 99]);
      expect(blocked.map((i: { number: number }) => i.number)).toEqual([35]);
      expect(blocked.length + queue.length + backlog.length).toBe(total);
    });

    it('is empty when nothing is sev1', () => {
      expect(sortFleetLanes(fleet).sev1).toEqual([]);
    });
  });

  it('tolerates a non-array input', () => {
    expect(sortFleetLanes(null).repos).toEqual([]);
  });
});
