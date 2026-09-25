/**
 * lib/chain/evidence.mjs — the chain's verdicts are DERIVED, never authored.
 *
 * These lock the rule that motivated the rewrite: only real rows getting through
 * promote a stage. Shipped code does not. The previous hand-written version
 * rated stages on how finished the code looked and was wrong in both directions
 * at once — it called publish broken while two sites were deployed, and called
 * migration 0007 unapplied while its columns were live.
 */
import { describe, it, expect } from 'vitest';
import { deriveChain } from '../../lib/chain/evidence.mjs';
import { STAGES, CHAIN_ENV_KEYS } from '../../lib/chain/stages.mjs';

/** Every env var present, so env never confounds a count-driven assertion. */
const ALL_ENV: Record<string, boolean> = Object.fromEntries(
  CHAIN_ENV_KEYS.map((k: string) => [k, true]),
);

/** Funnel counts by position, 1-based, for readability. */
function funnelOf(counts: (number | null)[]) {
  return Object.fromEntries(
    STAGES.map((s: { metric: string }, i: number) => [s.metric, counts[i]]),
  );
}

/** The live shape on 2026-09-15, straight from the leads table. */
const FULL = [263, 249, 39, 3, 2, 0, 0, 0];

describe('deriveChain — state comes from rows, not from code', () => {
  it('marks a stage proven only when rows actually reached it', () => {
    const { links } = deriveChain({ funnel: funnelOf(FULL), env: ALL_ENV });
    expect(links[0].state).toBe('proven');
    expect(links[4].state).toBe('proven');
  });

  it('calls a zero stage ready — not broken — when nothing it needs is missing', () => {
    const { links } = deriveChain({ funnel: funnelOf(FULL), env: ALL_ENV });
    expect(links[6].count).toBe(0);
    expect(links[6].state).toBe('ready');
  });

  it('calls a zero stage blocked and NAMES the missing env var', () => {
    const { links } = deriveChain({
      funnel: funnelOf(FULL),
      env: { ...ALL_ENV, SMARTLEAD_API_KEY: false },
    });
    const outreach = links[5];
    expect(outreach.state).toBe('blocked');
    expect(outreach.missingEnv).toEqual(['SMARTLEAD_API_KEY']);
  });

  it('never collapses "cannot measure" into "nothing got through"', () => {
    const { links } = deriveChain({
      funnel: funnelOf([263, 249, null, 3, 2, 0, 0, 0]),
      env: ALL_ENV,
    });
    expect(links[2].state).toBe('unknown');
    expect(links[2].count).toBeNull();
  });

  it('does not let a missing env var promote or demote a PROVEN stage', () => {
    const { links } = deriveChain({ funnel: funnelOf(FULL), env: {} });
    expect(links[0].state).toBe('proven');
  });
});

describe('deriveChain — the break is computed', () => {
  it('names the first stage nothing reached, after one that something did', () => {
    // Real shape as of 2026-09-15: sites got published, nobody got contacted.
    const { firstBreak } = deriveChain({ funnel: funnelOf(FULL), env: ALL_ENV });
    expect(firstBreak?.metric).toBe('contacted');
  });

  it('treats a trailing run of zeros as ONE break, not one per stage', () => {
    const { firstBreak } = deriveChain({ funnel: funnelOf(FULL), env: ALL_ENV });
    expect(firstBreak?.n).toBe(6);
  });

  it('reports no break when flow reaches the end', () => {
    const { firstBreak } = deriveChain({
      funnel: funnelOf([9, 8, 7, 6, 5, 4, 3, 2]),
      env: ALL_ENV,
    });
    expect(firstBreak).toBeNull();
  });

  it('breaks at the first stage when the funnel is empty', () => {
    const { firstBreak } = deriveChain({
      funnel: funnelOf([0, 0, 0, 0, 0, 0, 0, 0]),
      env: ALL_ENV,
    });
    expect(firstBreak?.n).toBe(1);
  });

  // A mid-funnel zero followed by a non-zero would mean the counts aren't
  // nested; report the first zero and stop rather than inventing a story.
  it('stops at the first zero rather than scanning past it', () => {
    const { firstBreak } = deriveChain({
      funnel: funnelOf([10, 0, 5, 0, 0, 0, 0, 0]),
      env: ALL_ENV,
    });
    expect(firstBreak?.n).toBe(2);
  });
});

describe('deriveChain — the biggest leak is separate from the break', () => {
  it('finds the steepest proportional drop, not the largest absolute one', () => {
    // 249→39 loses 210 rows but keeps 16%; 39→3 loses 36 but keeps only 8%.
    const { biggestDrop } = deriveChain({ funnel: funnelOf(FULL), env: ALL_ENV });
    expect(biggestDrop?.from.metric).toBe('qualified');
    expect(biggestDrop?.to.metric).toBe('generated');
  });

  it('skips pairs touching an unmeasurable stage instead of treating null as zero', () => {
    const { biggestDrop } = deriveChain({
      funnel: funnelOf([100, 100, null, 100, 100, 100, 100, 100]),
      env: ALL_ENV,
    });
    // Every measurable pair holds 100%; a null read as 0 would fake a total drop.
    expect(biggestDrop?.kept).toBe(1);
    expect(biggestDrop?.from.metric).not.toBe('qualified');
    expect(biggestDrop?.to.metric).not.toBe('qualified');
  });

  it('returns null for an empty funnel rather than dividing by zero', () => {
    expect(deriveChain({ funnel: {}, env: {} }).biggestDrop).toBeNull();
  });
});

describe('deriveChain — defensive', () => {
  it('survives being called with nothing at all', () => {
    const chain = deriveChain();
    expect(chain.links).toHaveLength(STAGES.length);
    expect(chain.links.every((l: { state: string }) => l.state === 'unknown')).toBe(true);
  });
});

describe('STAGES', () => {
  it('is numbered 1..n with no gaps, since the order carries the dependency', () => {
    expect(STAGES.map((s: { n: number }) => s.n)).toEqual(
      STAGES.map((_: unknown, i: number) => i + 1),
    );
  });

  it('gives every stage a distinct funnel metric to be proven by', () => {
    const metrics = STAGES.map((s: { metric: string }) => s.metric);
    expect(new Set(metrics).size).toBe(metrics.length);
  });

  it('carries no authored verdict — no percentage or state field', () => {
    for (const s of STAGES as Record<string, unknown>[]) {
      expect(s).not.toHaveProperty('built');
      expect(s).not.toHaveProperty('state');
    }
  });
});

describe('deriveChain — stage 5 liveness note (ops#322)', () => {
  const funnel = { sourced: 10, scored: 10, qualified: 5, generated: 3, published: 2 };

  it('says nothing about liveness when no probe ran', () => {
    const link = deriveChain({ funnel, env: {} }).links.find((l) => l.metric === 'published');
    expect(link?.note).not.toMatch(/Stored vs live/);
    expect(link?.liveness).toBeNull();
  });

  it('reports how many of the stored URLs answered', () => {
    const link = deriveChain({
      funnel,
      env: {},
      liveness: { stored: 2, live: 2, dead: 0, unchecked: 0 },
    }).links.find((l) => l.metric === 'published');
    expect(link?.note).toMatch(/2\/2 answered/);
  });

  // The failure this issue exists to prevent: a stage reading `proven` off a
  // dead link. The count stays 2 — the funnel nesting depends on it — but the
  // note has to say so out loud.
  it('surfaces a dead URL without changing the stored count', () => {
    const link = deriveChain({
      funnel,
      env: {},
      liveness: { stored: 2, live: 1, dead: 1, unchecked: 0 },
    }).links.find((l) => l.metric === 'published');
    expect(link?.count).toBe(2);
    expect(link?.note).toMatch(/1\/2 answered/);
    expect(link?.note).toMatch(/1 did not/);
  });

  // "We could not check" must never read as "it is down".
  it('reports unchecked separately from dead', () => {
    const link = deriveChain({
      funnel,
      env: {},
      liveness: { stored: 2, live: 0, dead: 0, unchecked: 2 },
    }).links.find((l) => l.metric === 'published');
    expect(link?.note).toMatch(/2 unchecked/);
    expect(link?.note).not.toMatch(/did not/);
  });

  it('leaves the other seven stages untouched', () => {
    const links = deriveChain({
      funnel,
      env: {},
      liveness: { stored: 2, live: 1, dead: 1, unchecked: 0 },
    }).links.filter((l) => l.metric !== 'published');
    for (const l of links) {
      expect(l.note).not.toMatch(/Stored vs live/);
      expect(l).not.toHaveProperty('liveness');
    }
  });
});

describe('deriveChain — stage notes carry no status claims (2026-09-25)', () => {
  it('no stage note asserts a state that can go stale', () => {
    // A note is structure ("what this stage does"). Anything that changes
    // without a code change — "never run", "no billing path yet", "are live" —
    // belongs in derived fields, where it cannot silently rot.
    for (const s of STAGES) {
      expect(s.note, `stage ${s.n}`).not.toMatch(
        /never run|has never|not yet|exists yet|are live|gates this/i,
      );
    }
  });

  it('labels the last stage by what it counts: a deal marked won, not money received', () => {
    const last = STAGES[STAGES.length - 1];
    expect(last.metric).toBe('won');
    expect(last.name).not.toMatch(/paid/i);
  });
});

describe('deriveChain — optional env keys are reported live, never block', () => {
  it('names an unset optional key without blocking the stage', () => {
    const { links } = deriveChain({
      funnel: funnelOf(FULL),
      env: { ...ALL_ENV, PAGESPEED_API_KEY: false },
    });
    const qualify = links[2];
    expect(qualify.state).toBe('proven');
    expect(qualify.missingOptional).toEqual(['PAGESPEED_API_KEY']);
  });

  it('reports nothing when the optional key is set', () => {
    const { links } = deriveChain({ funnel: funnelOf(FULL), env: ALL_ENV });
    expect(links[2].missingOptional).toEqual([]);
  });

  it('asks the server about optional keys too', () => {
    expect(CHAIN_ENV_KEYS).toContain('PAGESPEED_API_KEY');
  });
});

describe('deriveChain — linked issues show live open/closed state', () => {
  const outreachIssues = STAGES[5].issues;

  it('marks an issue closed when the fleet read is complete and it is not open', () => {
    const [openOne, ...rest] = outreachIssues;
    const { links } = deriveChain({
      funnel: funnelOf(FULL),
      env: ALL_ENV,
      openIssues: { numbers: [openOne], complete: true },
    });
    expect(links[5].issueStates).toEqual([
      { n: openOne, open: true },
      ...rest.map((n: number) => ({ n, open: false })),
    ]);
  });

  it('says unknown (null), not closed, when the read is partial or missing', () => {
    const partial = deriveChain({
      funnel: funnelOf(FULL),
      env: ALL_ENV,
      openIssues: { numbers: [], complete: false },
    });
    expect(
      partial.links[5].issueStates.every((i: { open: boolean | null }) => i.open === null),
    ).toBe(true);
    const none = deriveChain({ funnel: funnelOf(FULL), env: ALL_ENV });
    expect(none.links[5].issueStates.every((i: { open: boolean | null }) => i.open === null)).toBe(
      true,
    );
  });
});
