/**
 * lib/tasks/ralph-wedge.mjs — MUST mirror ralph/lib.sh:111-127's
 * classify_wedged exactly: failure gate = always wedged; none/pending gate
 * wedges only once the PR has sat ≥3h untouched; a passing/other gate never
 * wedges regardless of age.
 */
import { describe, it, expect } from 'vitest';
import { classifyWedged } from '../../lib/tasks/ralph-wedge.mjs';

const NOW = new Date('2026-07-12T12:00:00Z').getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe('classifyWedged', () => {
  it('wedges on a failed gate regardless of age', () => {
    expect(classifyWedged({ gate: 'failure', updatedAt: hoursAgo(0.1) }, NOW)).toEqual({
      wedged: true,
      reason: 'ralph-gate FAILED — needs a human.',
    });
  });

  it('does not wedge a gate-less PR under 3h old', () => {
    expect(classifyWedged({ gate: 'none', updatedAt: hoursAgo(1) }, NOW)).toEqual({
      wedged: false,
      reason: null,
    });
  });

  it('wedges a gate-less PR at exactly 3h', () => {
    const result = classifyWedged({ gate: 'none', updatedAt: hoursAgo(3) }, NOW);
    expect(result.wedged).toBe(true);
    expect(result.reason).toContain('no passing ralph-gate');
  });

  it('wedges a pending gate past 3h the same as no gate', () => {
    expect(classifyWedged({ gate: 'pending', updatedAt: hoursAgo(5) }, NOW).wedged).toBe(true);
  });

  it('never wedges a passing gate, however old', () => {
    expect(classifyWedged({ gate: 'success', updatedAt: hoursAgo(100) }, NOW)).toEqual({
      wedged: false,
      reason: null,
    });
  });
});
