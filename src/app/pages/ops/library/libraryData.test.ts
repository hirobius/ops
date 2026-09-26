import { describe, expect, it } from 'vitest';

import {
  LEGACY_LOADERS,
  buildVsBuy,
  entryHref,
  library,
  pipelineWalkthrough,
  sortSystems,
  stateOfPlay,
  type BvbSystem,
} from './libraryData';

describe('library index', () => {
  it('has unique slugs', () => {
    const slugs = library.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('every legacy entry has a loader for its source file', () => {
    // A legacy entry whose source has no loader would render an empty frame —
    // the page would look fine and show nothing.
    for (const e of library.filter((x) => x.render === 'legacy')) {
      expect(LEGACY_LOADERS[e.slug], e.slug).toBeTypeOf('function');
    }
  });

  it('links hds entries to their own route, legacy entries under /ops/library', () => {
    expect(entryHref({ slug: 'fleet-audit', render: 'hds', href: '/ops/audit' })).toBe(
      '/ops/audit',
    );
    expect(entryHref({ slug: 'state-of-play', render: 'legacy' })).toBe(
      '/ops/library/state-of-play',
    );
    expect(entryHref({ slug: 'build-vs-buy', render: 'hds' })).toBe('/ops/library/build-vs-buy');
  });

  it('lists newest first', () => {
    const dates = library.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('has no legacy loaders left over once an entry migrates to hds', () => {
    // Every entry currently renders natively — a stale loader here would be
    // dead code the ops#424 migration was supposed to remove.
    const legacySlugs = new Set(library.filter((e) => e.render === 'legacy').map((e) => e.slug));
    for (const slug of Object.keys(LEGACY_LOADERS)) {
      expect(legacySlugs.has(slug), slug).toBe(true);
    }
  });
});

describe('state-of-play data', () => {
  it('has six vital signs and at least one commitment/blocker/next-step', () => {
    expect(stateOfPlay.vitals).toHaveLength(6);
    expect(stateOfPlay.commitments.length).toBeGreaterThan(0);
    expect(stateOfPlay.blockers.length).toBeGreaterThan(0);
    expect(stateOfPlay.nextSteps.length).toBeGreaterThan(0);
  });

  it('uses only the three commitment statuses', () => {
    for (const c of stateOfPlay.commitments) {
      expect(['done', 'part', 'stop'], c.title).toContain(c.status);
    }
  });

  it('never hand-writes a live pipeline verdict — it defers to /ops/standing', () => {
    // This is a snapshot; ops#424's DoD is that live status still comes from
    // /ops/standing, not this document.
    expect(stateOfPlay.vitalsNote).toContain('/ops/standing');
  });
});

describe('pipeline-walkthrough data', () => {
  it('has at least one stage and a tally entry per status used', () => {
    expect(pipelineWalkthrough.stages.length).toBeGreaterThan(0);
    const statusesUsed = new Set(pipelineWalkthrough.stages.map((s) => s.status));
    const tallied = new Set(pipelineWalkthrough.tally.map((t) => t.status));
    for (const status of statusesUsed) {
      if (status === 'future') continue; // "future" stages aren't tallied on the original page
      expect(tallied.has(status), status).toBe(true);
    }
  });

  it('stages are numbered in order starting at 1', () => {
    expect(pipelineWalkthrough.stages.map((s) => s.n)).toEqual(
      pipelineWalkthrough.stages.map((_, i) => i + 1),
    );
  });
});

describe('build-vs-buy data', () => {
  const ids = new Set(buildVsBuy.systems.map((s) => s.id));

  it('uses only the three verdicts and S/M/L effort', () => {
    for (const s of buildVsBuy.systems) {
      expect(['REPLACE', 'WRAP', 'KEEP'], s.id).toContain(s.verdict);
      expect([null, 'S', 'M', 'L'], s.id).toContain(s.effort);
      expect(s.payoff).toBeGreaterThanOrEqual(0);
      expect(s.payoff).toBeLessThanOrEqual(100);
    }
  });

  it('has exactly five top picks, each pointing at a real system', () => {
    expect(buildVsBuy.topFive).toHaveLength(5);
    for (const t of buildVsBuy.topFive) expect(ids.has(t.systemId), t.systemId).toBe(true);
  });

  it('has unique system ids', () => {
    expect(ids.size).toBe(buildVsBuy.systems.length);
  });
});

describe('sortSystems', () => {
  const rows = [
    { id: 'a', name: 'Beta', payoff: 10, effort: 'L', lines: 5 },
    { id: 'b', name: 'alpha', payoff: 90, effort: null, lines: 50 },
    { id: 'c', name: 'Gamma', payoff: 40, effort: 'S', lines: 0 },
  ] as unknown as BvbSystem[];

  it('sorts numbers descending by default for payoff', () => {
    expect(sortSystems(rows, 'payoff', 'desc').map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts text case-insensitively', () => {
    expect(sortSystems(rows, 'name', 'asc').map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });

  it('orders effort S < M < L with unknown last', () => {
    expect(sortSystems(rows, 'effort', 'asc').map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('does not mutate its input', () => {
    const before = rows.map((r) => r.id);
    sortSystems(rows, 'payoff', 'asc');
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});
