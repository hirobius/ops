/**
 * tests/api/steering-budget.test.ts — ops#292.
 *
 * The always-on context budget. This gate exists because docs/ai/HANDOFF.md
 * reached 119KB while carrying a "keep it one page" instruction at the top of
 * itself — a one-time trim regrows, an enforced budget does not.
 */
import { describe, it, expect } from 'vitest';
import { evaluateBudget, fmt } from '../../scripts/lib/steering-budget.mjs';

describe('evaluateBudget', () => {
  it('passes when the set is under budget', () => {
    const r = evaluateBudget({ maxTotalBytes: 1000, sizes: { 'a.md': 400, 'b.md': 300 } });
    expect(r.total).toBe(700);
    expect(r.over).toBe(0);
    expect(r.violations).toEqual([]);
  });

  it('passes exactly at the budget', () => {
    const r = evaluateBudget({ maxTotalBytes: 700, sizes: { 'a.md': 400, 'b.md': 300 } });
    expect(r.over).toBe(0);
    expect(r.violations).toEqual([]);
  });

  it('fails one byte over', () => {
    const r = evaluateBudget({ maxTotalBytes: 699, sizes: { 'a.md': 400, 'b.md': 300 } });
    expect(r.over).toBe(1);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].id).toBe('steering-budget-exceeded');
  });

  it('names the largest contributor so the fix is obvious', () => {
    const r = evaluateBudget({
      maxTotalBytes: 100,
      sizes: { 'small.md': 50, 'HANDOFF.md': 5000 },
    });
    expect(r.violations[0].detail).toContain('HANDOFF.md');
  });

  it('flags a manifest entry whose file is missing', () => {
    const r = evaluateBudget({ maxTotalBytes: 1000, sizes: { 'gone.md': null, 'a.md': 10 } });
    expect(r.violations.some((v) => v.id === 'missing-gone.md')).toBe(true);
  });

  it('does not count a missing file toward the total', () => {
    const r = evaluateBudget({ maxTotalBytes: 1000, sizes: { 'gone.md': null, 'a.md': 10 } });
    expect(r.total).toBe(10);
  });

  it('is empty-safe', () => {
    const r = evaluateBudget({ maxTotalBytes: 100, sizes: {} });
    expect(r.total).toBe(0);
    expect(r.violations).toEqual([]);
  });
});

describe('fmt', () => {
  it('uses bytes under 1KB and KB above', () => {
    expect(fmt(512)).toBe('512B');
    expect(fmt(2048)).toBe('2.0KB');
  });
});
