/**
 * lib/tasks/overlap.mjs — file-overlap gate (issue #47, B.3). Revives
 * check-unit-overlap.mjs's core idea ("two agents must NEVER touch the same
 * file"). Pure path-prefix matching, no glob library — every case here is a
 * plain array in, a plain array out.
 */

import { describe, it, expect } from 'vitest';
import { pathsOverlap, touchesOverlap, partitionByOverlap, findAllOverlaps } from '../../lib/tasks/overlap.mjs';

describe('pathsOverlap', () => {
  it('is true for identical paths', () => {
    expect(pathsOverlap('src/app/pages/Foo.tsx', 'src/app/pages/Foo.tsx')).toBe(true);
  });

  it('is true when one path is a directory prefix of the other', () => {
    expect(pathsOverlap('src/app/pages/Foo.tsx', 'src/app/pages/')).toBe(true);
    expect(pathsOverlap('src/app/pages/', 'src/app/pages/Foo.tsx')).toBe(true);
  });

  it('is false for a sibling directory that merely shares a prefix string', () => {
    expect(pathsOverlap('src/app/pages/Foo.tsx', 'src/app/pages-other/Bar.tsx')).toBe(false);
  });

  it('is false for unrelated paths', () => {
    expect(pathsOverlap('scripts/fleet-dispatch.mjs', 'lib/tasks/tier.mjs')).toBe(false);
  });

  it('is false for empty/non-string input', () => {
    expect(pathsOverlap('', 'lib/tasks/tier.mjs')).toBe(false);
    expect(pathsOverlap(null, 'lib/tasks/tier.mjs')).toBe(false);
  });
});

describe('touchesOverlap', () => {
  it('is false when either list is empty (unknown scope, honor-system gap)', () => {
    expect(touchesOverlap([], ['lib/tasks/tier.mjs'])).toBe(false);
    expect(touchesOverlap(['lib/tasks/tier.mjs'], [])).toBe(false);
    expect(touchesOverlap(undefined, ['lib/tasks/tier.mjs'])).toBe(false);
  });

  it('is true when any pair of paths overlaps', () => {
    expect(touchesOverlap(['a/b.ts', 'c/d.ts'], ['x/y.ts', 'c/d.ts'])).toBe(true);
  });

  it('is false when no pair overlaps', () => {
    expect(touchesOverlap(['a/b.ts'], ['x/y.ts'])).toBe(false);
  });
});

function candidate(key, touches) {
  return { task: { key, touches, title: key }, tier: 'standard', model: 'sonnet' };
}

describe('partitionByOverlap', () => {
  it('keeps everything clear when nothing overlaps', () => {
    const candidates = [candidate('a', ['lib/a.mjs']), candidate('b', ['lib/b.mjs'])];
    const { clear, blocked } = partitionByOverlap(candidates, []);
    expect(clear.map((c) => c.task.key)).toEqual(['a', 'b']);
    expect(blocked).toEqual([]);
  });

  it('blocks a candidate that overlaps an in-flight task', () => {
    const candidates = [candidate('a', ['lib/tasks/tier.mjs'])];
    const inFlight = [{ key: 'github:hirobius/ops#9', touches: ['lib/tasks/'] }];
    const { clear, blocked } = partitionByOverlap(candidates, inFlight);
    expect(clear).toEqual([]);
    expect(blocked).toEqual([{ ...candidates[0], conflictsWith: 'github:hirobius/ops#9' }]);
  });

  it('blocks the second of two same-run candidates that overlap each other (first-in-run wins)', () => {
    const candidates = [candidate('first', ['lib/x.mjs']), candidate('second', ['lib/x.mjs'])];
    const { clear, blocked } = partitionByOverlap(candidates, []);
    expect(clear.map((c) => c.task.key)).toEqual(['first']);
    expect(blocked).toEqual([{ ...candidates[1], conflictsWith: 'first' }]);
  });

  it('never blocks a candidate with no declared touches', () => {
    const candidates = [candidate('a', undefined)];
    const inFlight = [{ key: 'other', touches: ['lib/a.mjs'] }];
    const { clear, blocked } = partitionByOverlap(candidates, inFlight);
    expect(clear.map((c) => c.task.key)).toEqual(['a']);
    expect(blocked).toEqual([]);
  });
});

describe('findAllOverlaps', () => {
  it('finds every overlapping pair among tasks with declared touches', () => {
    const tasks = [
      { key: 'a', touches: ['lib/x.mjs'] },
      { key: 'b', touches: ['lib/y.mjs'] },
      { key: 'c', touches: ['lib/x.mjs'] },
    ];
    expect(findAllOverlaps(tasks)).toEqual([{ a: 'a', b: 'c' }]);
  });

  it('ignores tasks with no declared touches', () => {
    const tasks = [{ key: 'a' }, { key: 'b', touches: [] }];
    expect(findAllOverlaps(tasks)).toEqual([]);
  });

  it('returns an empty array for fewer than two touching tasks', () => {
    expect(findAllOverlaps([{ key: 'a', touches: ['lib/x.mjs'] }])).toEqual([]);
    expect(findAllOverlaps([])).toEqual([]);
  });
});
