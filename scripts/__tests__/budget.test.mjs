/**
 * lib/tasks/budget.mjs — spend-ceiling logic (issue #47, B.1). No network,
 * no Date — every case is a plain object in, a plain object out.
 */

import { describe, it, expect } from 'vitest';
import {
  projectedCostUsd,
  capByBudget,
  DEFAULT_PER_RUN_CEILING_USD,
  DEFAULT_DAILY_CEILING_USD,
} from '../../lib/tasks/budget.mjs';

describe('projectedCostUsd', () => {
  it('computes mechanical/sonnet cost', () => {
    expect(projectedCostUsd('mechanical', 'sonnet')).toBeCloseTo(0.006, 6);
  });

  it('computes standard/sonnet cost', () => {
    expect(projectedCostUsd('standard', 'sonnet')).toBeCloseTo(0.024, 6);
  });

  it('computes judgment/opus cost', () => {
    expect(projectedCostUsd('judgment', 'opus')).toBeCloseTo(0.45, 6);
  });

  it('throws for an unknown model', () => {
    expect(() => projectedCostUsd('standard', 'haiku')).toThrow(/No price entry/);
  });

  it('throws for an unknown tier', () => {
    expect(() => projectedCostUsd('unknown-tier', 'sonnet')).toThrow(/No effort-token entry/);
  });
});

function candidate(key, tier, model) {
  return { task: { key, title: key }, tier, model };
}

describe('capByBudget', () => {
  it('returns everything as affordable when well under both ceilings', () => {
    const candidates = [candidate('a', 'mechanical', 'sonnet'), candidate('b', 'standard', 'sonnet')];
    const { affordable, skipped, runTotalUsd } = capByBudget(candidates);
    expect(affordable.map((c) => c.task.key)).toEqual(['a', 'b']);
    expect(skipped).toEqual([]);
    expect(runTotalUsd).toBeCloseTo(0.03, 6);
  });

  it('skips candidates once the per-run ceiling would be exceeded', () => {
    const candidates = [candidate('a', 'judgment', 'opus'), candidate('b', 'judgment', 'opus')];
    // opus/judgment = $0.45 each; ceiling of $0.5 allows exactly one.
    const { affordable, skipped } = capByBudget(candidates, { perRunCeilingUsd: 0.5 });
    expect(affordable.map((c) => c.task.key)).toEqual(['a']);
    expect(skipped.map((c) => c.task.key)).toEqual(['b']);
  });

  it('skips candidates once the daily ceiling (already-spent + running total) would be exceeded', () => {
    const candidates = [candidate('a', 'mechanical', 'sonnet')];
    const { affordable, skipped } = capByBudget(candidates, {
      dailySpentUsd: 9.999,
      dailyCeilingUsd: 10,
      perRunCeilingUsd: 100,
    });
    expect(affordable).toEqual([]);
    expect(skipped.map((c) => c.task.key)).toEqual(['a']);
  });

  it('lets a later cheap candidate still fit after an earlier expensive one is skipped', () => {
    const candidates = [
      candidate('expensive', 'judgment', 'opus'),
      candidate('cheap', 'mechanical', 'sonnet'),
    ];
    const { affordable, skipped } = capByBudget(candidates, { perRunCeilingUsd: 0.1 });
    expect(affordable.map((c) => c.task.key)).toEqual(['cheap']);
    expect(skipped.map((c) => c.task.key)).toEqual(['expensive']);
  });

  it('falls back to the documented defaults when ceilings are omitted', () => {
    const candidates = [candidate('a', 'mechanical', 'sonnet')];
    const { affordable } = capByBudget(candidates, {});
    expect(affordable).toHaveLength(1);
    expect(DEFAULT_PER_RUN_CEILING_USD).toBe(5);
    expect(DEFAULT_DAILY_CEILING_USD).toBe(25);
  });

  it('handles an empty/non-array candidate list', () => {
    expect(capByBudget([])).toEqual({ affordable: [], skipped: [], runTotalUsd: 0 });
    expect(capByBudget(undefined)).toEqual({ affordable: [], skipped: [], runTotalUsd: 0 });
  });
});
