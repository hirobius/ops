/**
 * lib/tasks/fleet.mjs — the lane rules behind /ops/standing's fleet-wide read.
 *
 * The contract these lock down: a repo joins the fleet by EXISTING in the
 * token's issue feed, never by appearing in a hardcoded list; parked outranks
 * blocked; and one PR search covers every owner rather than one call per repo.
 */
import { describe, it, expect } from 'vitest';
import {
  ageInDays,
  blockingLabelOf,
  laneOf,
  openPrSearchQuery,
  ownersOf,
  priorityOf,
  ralphRepos,
  sortFleetLanes,
  summarizeLoop,
  toRow,
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
    for (const l of [
      'needs-adrian',
      'needs-decision',
      'needs-credential',
      'needs-human',
      'blocked',
    ]) {
      expect(laneOf(issue({ labels: [l] }))).toBe('blocked');
    }
  });

  it('routes the ops#295 split labels, which ops#359 relabelled 14 issues onto', () => {
    // The regression this locks: ops#359 retired `needs-human` and updated
    // CLAUDE.md, AGENTS.md and metric-human-gate-latency.mjs — but not
    // BLOCKING_LABELS. 13 human-gated issues rendered as ordinary backlog, and
    // the "blocked on you" count the page exists to show was wrong.
    expect(laneOf(issue({ labels: ['backlog', 'p2', 'needs-decision'] }))).toBe('blocked');
    expect(laneOf(issue({ labels: ['p2', 'needs-credential'] }))).toBe('blocked');
  });

  it('keeps needs-human routing — it was retired in ops only, and this sweep is fleet-wide', () => {
    expect(laneOf(issue({ repo: 'hirobius/site-engine', labels: ['needs-human'] }))).toBe(
      'blocked',
    );
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
    expect(ownersOf(['hirobius/ops', 'adr-eng/access', 'hirobius/client-site'])).toEqual([
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
    issue({ repo: 'hirobius/client-site', number: 12, labels: ['ralph-ready', 'p0'] }),
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
      'hirobius/client-site',
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

/* ── the clock the lanes lacked ──────────────────────────────────────────── */

const NOW = Date.parse('2026-09-16T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

describe('ageInDays', () => {
  it('counts whole days back from now', () => {
    expect(ageInDays(daysAgo(64), NOW)).toBe(64);
    expect(ageInDays(daysAgo(0), NOW)).toBe(0);
  });

  it('returns null — never 0 — when there is no usable date', () => {
    // 0 would sort as "arrived today" and render as a measured age. The
    // distinction between "new" and "unmeasurable" is the whole point.
    expect(ageInDays(null, NOW)).toBeNull();
    expect(ageInDays(undefined, NOW)).toBeNull();
    expect(ageInDays('not-a-date', NOW)).toBeNull();
  });

  it('floors a future timestamp at 0 rather than going negative', () => {
    expect(ageInDays(new Date(NOW + 86_400_000).toISOString(), NOW)).toBe(0);
  });
});

describe('sortFleetLanes — blocked lane ordering', () => {
  it('puts the oldest first, with priority only breaking a tie', () => {
    // The regression this locks: ops#185 sat p0 and unqueued for 64 days
    // because the lane sorted by priority label, so a p0 filed in May and a p0
    // filed yesterday were indistinguishable.
    const { blocked } = sortFleetLanes(
      [
        issue({ number: 1, labels: ['needs-adrian', 'p0'], created_at: daysAgo(2) }),
        issue({ number: 2, labels: ['needs-adrian', 'p3'], created_at: daysAgo(64) }),
        issue({ number: 3, labels: ['needs-adrian', 'p0'], created_at: daysAgo(64) }),
      ],
      { now: NOW },
    );
    expect(blocked.map((b: { number: number }) => b.number)).toEqual([3, 2, 1]);
    expect(blocked[0].ageDays).toBe(64);
  });

  it('sorts an unmeasurable age last instead of treating it as newest', () => {
    const { blocked } = sortFleetLanes(
      [
        issue({ number: 1, labels: ['needs-adrian'] }),
        issue({ number: 2, labels: ['needs-adrian'], created_at: daysAgo(5) }),
      ],
      { now: NOW },
    );
    expect(blocked.map((b: { number: number }) => b.number)).toEqual([2, 1]);
    expect(blocked[1].ageDays).toBeNull();
  });

  it('keeps parked ahead of blocked, and ages within each group', () => {
    const { blocked } = sortFleetLanes(
      [
        issue({ number: 1, labels: ['needs-adrian'], created_at: daysAgo(90) }),
        issue({ number: 2, labels: ['ralph-parked'], created_at: daysAgo(1) }),
        issue({ number: 3, labels: ['ralph-parked'], created_at: daysAgo(30) }),
      ],
      { now: NOW },
    );
    expect(blocked.map((b: { number: number }) => b.number)).toEqual([3, 2, 1]);
  });
});

/* ── is the loop turning ─────────────────────────────────────────────────── */

describe('ralphRepos', () => {
  it('derives the repo set from ralph-* labels rather than a config list', () => {
    expect(
      ralphRepos([
        issue({ repo: 'hirobius/ops', labels: ['ralph-ready'] }),
        issue({ repo: 'hirobius/site-engine', labels: ['ralph-parked'] }),
        issue({ repo: 'hirobius/quiet', labels: ['backlog'] }),
      ]),
    ).toEqual(['hirobius/ops', 'hirobius/site-engine']);
  });

  it('caps the fan-out — this is the only per-repo call on the read', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f'].map((r) =>
      issue({ repo: `o/${r}`, labels: ['ralph-auto'] }),
    );
    expect(ralphRepos(many)).toHaveLength(4);
    expect(ralphRepos(many, 2)).toHaveLength(2);
  });
});

describe('summarizeLoop', () => {
  const run = (over: Record<string, unknown> = {}) => ({
    number: 7,
    title: 'ralph #7',
    url: 'https://github.com/hirobius/ops/actions/runs/7',
    status: 'completed',
    conclusion: 'success',
    started_at: new Date(NOW - 2 * 3_600_000).toISOString(),
    ...over,
  });

  it('reports a queued or in-progress iteration as running', () => {
    for (const status of ['queued', 'in_progress']) {
      const [l] = summarizeLoop([{ repo: 'o/r', runs: [run({ status, conclusion: null })] }], NOW);
      expect(l.state).toBe('running');
      expect(l.quietHours).toBeNull();
    }
  });

  it('reports a bad conclusion as failed and carries it', () => {
    for (const conclusion of ['failure', 'startup_failure', 'timed_out', 'cancelled']) {
      const [l] = summarizeLoop([{ repo: 'o/r', runs: [run({ conclusion })] }], NOW);
      expect(l.state).toBe('failed');
      expect(l.conclusion).toBe(conclusion);
    }
  });

  it('reports a clean newest run as idle, with how long it has been quiet', () => {
    const [l] = summarizeLoop([{ repo: 'o/r', runs: [run()] }], NOW);
    expect(l.state).toBe('idle');
    expect(l.quietHours).toBe(2);
  });

  it('never collapses an unreadable repo into idle', () => {
    // A repo whose runs could not be read has NOT been observed to be quiet.
    // CLAUDE.md §4: a ralph-gate startup_failure with 0 jobs is usually a
    // permission wall, so the reason has to survive to the surface.
    const [l] = summarizeLoop([{ repo: 'o/r', runs: [], error: 'HTTP 403' }], NOW);
    expect(l.state).toBe('unknown');
    expect(l.error).toBe('HTTP 403');
    expect(l.run).toBeNull();
  });

  it('treats no runs at all as unknown, not idle', () => {
    const [l] = summarizeLoop([{ repo: 'o/r', runs: [] }], NOW);
    expect(l.state).toBe('unknown');
  });
});

/* ── the shared row shape ────────────────────────────────────────────────── */

describe('toRow', () => {
  const base = {
    repo: 'hirobius/ops',
    number: 44,
    title: 'Auto-record preview_url',
    url: 'https://github.com/hirobius/ops/issues/44',
    labels: ['backlog', 'ralph-ready', 'ralph-auto', 'p2'],
    created_at: daysAgo(70),
    updated_at: daysAgo(2),
    comments: 14,
    assignee: 'adr-eng',
    hasDod: true,
    excerpt: 'Deploying a client site sets preview_url.',
  };

  it('carries the metadata a row is read by', () => {
    expect(toRow(base, NOW)).toMatchObject({
      repo: 'hirobius/ops',
      number: 44,
      prio: 'p2',
      ageDays: 70,
      quietDays: 2,
      comments: 14,
      assignee: 'adr-eng',
      hasDod: true,
      queued: true,
      auto: true,
      wip: false,
    });
  });

  it('exposes the loop toggles as booleans so every lane renders the same controls', () => {
    // The queue lane used to be bare chips with no actions while the backlog
    // beside it had buttons — the same issue was more operable depending on
    // which lane it landed in.
    const row = toRow({ ...base, labels: ['ralph-wip'] }, NOW);
    expect(row).toMatchObject({ queued: false, auto: false, wip: true, prio: null });
  });

  it('defaults the derived fields rather than emitting undefined', () => {
    const row = toRow({ repo: 'o/r', number: 1, title: 't', url: '#', labels: [] }, NOW);
    expect(row).toMatchObject({ comments: 0, assignee: null, hasDod: false, excerpt: '' });
    expect(row.ageDays).toBeNull();
  });
});
