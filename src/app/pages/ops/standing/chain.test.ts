import { describe, expect, it } from 'vitest';
import { CHAIN, chainSummary, type ChainLink } from './chain';

function link(over: Partial<ChainLink> & Pick<ChainLink, 'n'>): ChainLink {
  return {
    name: `link ${over.n}`,
    state: 'live',
    built: 100,
    note: '',
    issues: [],
    ...over,
  };
}

describe('chainSummary', () => {
  it('returns zeroed, break-free summary for an empty chain', () => {
    expect(chainSummary([])).toEqual({ averageBuilt: 0, throughput: 0, firstBreak: null });
  });

  it('reports no break when every link is live or merely partial', () => {
    const summary = chainSummary([
      link({ n: 1, built: 100 }),
      link({ n: 2, state: 'partial', built: 40 }),
    ]);
    expect(summary.firstBreak).toBeNull();
  });

  it('takes throughput from the weakest link, not the mean', () => {
    const summary = chainSummary([
      link({ n: 1, built: 100 }),
      link({ n: 2, built: 100 }),
      link({ n: 3, state: 'cut', built: 10 }),
    ]);
    expect(summary.averageBuilt).toBe(70);
    expect(summary.throughput).toBe(10);
  });

  it('names the EARLIEST blocking link, not the worst-built one', () => {
    const summary = chainSummary([
      link({ n: 1, built: 100 }),
      link({ n: 2, state: 'cut', built: 20 }),
      link({ n: 3, state: 'absent', built: 0 }),
    ]);
    expect(summary.firstBreak?.n).toBe(2);
  });

  it('orders by n, so a chain given out of order still breaks at the same link', () => {
    const shuffled = [
      link({ n: 3, state: 'absent', built: 0 }),
      link({ n: 1, built: 100 }),
      link({ n: 2, state: 'cut', built: 20 }),
    ];
    expect(chainSummary(shuffled).firstBreak?.n).toBe(2);
  });

  it('rounds the average rather than emitting a long float', () => {
    const summary = chainSummary([link({ n: 1, built: 100 }), link({ n: 2, built: 0 }), link({ n: 3, built: 0 })]);
    expect(summary.averageBuilt).toBe(33);
  });
});

describe('CHAIN', () => {
  it('is eight links numbered 1..8 with no gaps', () => {
    expect(CHAIN.map((l) => l.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('keeps every built figure inside 0..100', () => {
    for (const l of CHAIN) {
      expect(l.built).toBeGreaterThanOrEqual(0);
      expect(l.built).toBeLessThanOrEqual(100);
    }
  });

  it('breaks first at ④ publish — the finding the page exists to show', () => {
    expect(chainSummary(CHAIN).firstBreak?.n).toBe(4);
  });

  it('carries a note on every link, so no row renders bare', () => {
    for (const l of CHAIN) expect(l.note.length).toBeGreaterThan(0);
  });
});
