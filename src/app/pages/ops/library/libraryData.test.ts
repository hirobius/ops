import { describe, expect, it } from 'vitest';

import {
  LEGACY_LOADERS,
  buildVsBuy,
  entryHref,
  library,
  sortSystems,
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
