/**
 * lib/tasks/ralph-queue.mjs — the panel's queue MUST mirror the deterministic
 * selector (ralph/next.sh:26-32): p0→p3 then ascending issue number, unlabeled
 * last; blocked/needs-adrian/ralph-parked never appear; ralph-wip is annotated
 * (it's being worked — the runs lane shows it) but keeps its slot.
 */
import { describe, it, expect } from 'vitest';
import { orderRalphQueue } from '../../lib/tasks/ralph-queue.mjs';

function issue(repo: string, number: number, labels: string[] = []) {
  return {
    repo,
    number,
    title: `t${number}`,
    url: `https://github.com/${repo}/issues/${number}`,
    labels,
  };
}

describe('orderRalphQueue — selector parity', () => {
  it('orders by p-label (p0→p3) then ascending issue number, unlabeled last', () => {
    const out = orderRalphQueue([
      issue('hirobius/ops', 200),
      issue('hirobius/ops', 150, ['p2']),
      issue('hirobius/ops', 140, ['p1']),
      issue('hirobius/ops', 130),
      issue('hirobius/ops', 120, ['p1']),
      issue('hirobius/ops', 300, ['p0']),
    ]);
    expect(out.map((i) => i.number)).toEqual([300, 120, 140, 150, 130, 200]);
  });

  it('excludes blocked / needs-adrian / ralph-parked, exactly like next.sh', () => {
    const out = orderRalphQueue([
      issue('hirobius/ops', 1, ['p0', 'blocked']),
      issue('hirobius/ops', 2, ['needs-adrian']),
      issue('hirobius/ops', 3, ['ralph-parked', 'p1']),
      issue('hirobius/ops', 4, ['p3']),
    ]);
    expect(out.map((i) => i.number)).toEqual([4]);
  });

  it('annotates ralph-wip (being worked) without dropping or reordering it', () => {
    const out = orderRalphQueue([
      issue('hirobius/ops', 5, ['p1', 'ralph-wip']),
      issue('hirobius/ops', 6, ['p1']),
    ]);
    expect(out.map((i) => [i.number, i.wip])).toEqual([
      [5, true],
      [6, false],
    ]);
  });

  it('carries prio + repo through for rendering', () => {
    const [a] = orderRalphQueue([issue('hirobius/hds', 9, ['p2', 'enhancement'])]);
    expect(a.prio).toBe('p2');
    expect(a.repo).toBe('hirobius/hds');
  });

  it('empty input → empty queue', () => {
    expect(orderRalphQueue([])).toEqual([]);
  });
});
