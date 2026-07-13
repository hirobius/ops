/**
 * lib/tasks/ralph-wedge.mjs — MUST mirror ralph/lib.sh's classify_wedged()
 * exactly: failure → wedged; none/pending ≥3h → wedged; everything else
 * (including a healthy pending/none PR under 3h) is left alone.
 */
import { describe, it, expect } from 'vitest';
import { classifyWedged } from '../../lib/tasks/ralph-wedge.mjs';

describe('classifyWedged', () => {
  it('flags a failed ralph-gate as wedged regardless of age', () => {
    const out = classifyWedged({ gate: 'failure', ageHours: 0.1 });
    expect(out.wedged).toBe(true);
    expect(out.reason).toContain('ralph-gate FAILED');
  });

  it('flags a stale pending gate (>=3h) as wedged', () => {
    const out = classifyWedged({ gate: 'pending', ageHours: 3 });
    expect(out.wedged).toBe(true);
    expect(out.reason).toContain('3h');
  });

  it('flags a never-reported gate (none) at >=3h as wedged', () => {
    const out = classifyWedged({ gate: 'none', ageHours: 5.9 });
    expect(out.wedged).toBe(true);
    expect(out.reason).toContain('no passing ralph-gate');
  });

  it('does not flag a fresh pending/none gate under 3h', () => {
    expect(classifyWedged({ gate: 'pending', ageHours: 2.9 })).toEqual({
      wedged: false,
      reason: null,
    });
    expect(classifyWedged({ gate: 'none', ageHours: 0 })).toEqual({
      wedged: false,
      reason: null,
    });
  });

  it('never flags a passing gate, regardless of age', () => {
    expect(classifyWedged({ gate: 'success', ageHours: 999 })).toEqual({
      wedged: false,
      reason: null,
    });
  });
});
